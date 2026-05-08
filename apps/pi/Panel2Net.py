# Protoype for Panel2Net
# Reads serial data and pushes it via HTTP POST onto the net
# runs on Raspberry Pi
# Thomas Kohler (C) 2017/2018
# Version 1.4 / 10-05-2018

# imports
import os
import serial
from serial import SerialException

import http.client
import ssl
import logging
import urllib.request, urllib.parse, urllib.error
import time
import binascii
import random

# Resolve sibling files relative to this script so it works under any user account
SCRIPT_DIR = os.path.dirname(os.path.realpath(__file__))
ID_FILE  = os.path.join(SCRIPT_DIR, 'Panel2Net.id')
KEY_FILE = os.path.join(SCRIPT_DIR, 'scoreboard.key')

# THIS RETRIEVES THE UNIQUE DEVICENAME IN PANEL2NET.ID
Device_ID = ''
try:
    with open(ID_FILE, 'r') as f:
        for line in f:
            if line.startswith('Device_ID'):
                Device_ID = line[10:].strip()
except OSError:
    # If unique device name not given, try first with processor serial, then with random number
    try:
        with open('/proc/cpuinfo', 'r') as f:
            for line in f:
                if line.startswith('Serial'):
                    Device_ID = line[20:26]
    except OSError:
        # if no serial number could be picked up, then take a random number
        Device_ID = "SB_" + str(random.randint(100000, 999999))

print("Hello. I'm Scorebug: " + Device_ID)

# Load the bearer key (provisioned out-of-band, file mode 0600)
SCOREBOARD_KEY = ''
try:
    with open(KEY_FILE, 'r') as kf:
        SCOREBOARD_KEY = kf.read().strip()
except OSError:
    print('scoreboard.key missing at ' + KEY_FILE + ' — refusing to start')
    raise SystemExit(1)
if not SCOREBOARD_KEY:
    print('scoreboard.key is empty — refusing to start')
    raise SystemExit(1)

# Configuration Data (later to be put in Panel2Net.conf)
# SerialPort: Name of RPi serial port receiving the panel data
SerialPort = '/dev/ttyACM0'
# BaudRate: Serial port speed (Baud, Default will be adjusted later)
BaudRate = 19200
# PackageByTime: Time Duration until a package is closed
# and sent off (seconds)
PackageByTime = 0.1
# PackageByLength*	Length (in bytes) of data input
# until a package is closed and sent off
PackageByLength = 128

# RequestMode: GET or POST
RequestMode = 'POST'
# RequestServer: Server IP or Name (Amazon EC2)
RequestServer = 'api.app.hbdragons.de'
# RequestPort: Port over which HTTP request is being placed
RequestPort = 443
# RequestURL (Default)
RequestURL = '/api/scoreboard/ingest'
# for an answer before aborting (seconds)
RequestTimeOut = 10
# Number of Retries before attempting to switch baudrate  
ReadRetry = 3
# MaxBuffer before flushing (in order to avoid buffer overflow)
BufferMax = 2000

# LogFileName: Name of LogFile
LogFileName = '/tmp/Panel2Net.log'
# LogFileSize Maximum Size of LogFile (in Mbytes)
LogFileSize = 10
# LogLevel	Minimum Severity Level to be logged (see severity in Logs)
LogLevel = 'E'

logging.basicConfig(level=logging.DEBUG,
                    format='%(asctime)s %(levelname)s %(message)s',
                    filename=LogFileName,
                    filemode='w')

ser = serial.Serial()
ser.port = SerialPort
ser.baudrate = BaudRate
ser.bytesize = serial.EIGHTBITS
# number of bits per bytes
ser.parity = serial.PARITY_NONE
# set parity check: no parity
ser.stopbits = serial.STOPBITS_ONE
# number of stop bits
ser.timeout = PackageByTime
# non-block read
ser.xonxoff = False
# disable software flow control
ser.rtscts = False
# disable hardware (RTS/CTS) flow control
ser.dsrdtr = False
# disable hardware (DSR/DTR) flow control
ser.writeTimeout = 2
# timeout for write

while True:
    try:
        print ("Initializing")
        ser.close()
        ser.open()
        if ser.isOpen():
            try:
                ser.flushInput()
                # flush input buffer, discarding all its contents
                ser.flushOutput()
                # flush output buffer, aborting current output
                # and discard all that is in buffer
                RequestCount = 0
                fail_streak = 0
                print ("Port Opening")
                # Initialise RetryCounter
                RetryCount = 0
                # Initialise Variable to take remainder string
                remainder_hex = b''
        
                while True:
                    # If the BufferSize is larger than defined BufferMax then flush to avoid buffer overflow
                    # print("BufferSize: " + str(ser.inWaiting()) + ", BufferMax: " + str(BufferMax))
                    if ser.inWaiting() > BufferMax:
                        print ("\n>>> Buffer limit exceeded. Flushing buffer")
                        ser.flushInput()
                        ser.flushOutput()
                        remainder_hex = b''

                    # Read from Serial Interface
                    response = ser.read(PackageByLength)
    
                    if len(response) > 0:
                        # In case there is something coming down the serial path
                        logging.debug(response)

                        # Calculate Request Start Time
                        StarterTime = time.time() * 1000

                        # Kill the spaces between hex figures
                        response_hex = response.replace(b' ', b'')
                        # print("\nResponse_Hex: " + str(response_hex))

                        # Evaluate if the received data is HEX or needs conversion to HEX
                        try:
                            int(response_hex,16)    
                        except ValueError:
                            # not hex, needs conversion
                            response_hex = binascii.hexlify(response)
                            response_hex = response_hex.upper()
                            # print("\nResponse_Raw: " + str(response))    
                            # print("\nResponse_Hex: " + str(response_hex))

                        # Add the remainder to the start of the sequence
                        response_hex = remainder_hex + response_hex

                        # Evaluate if the received data matches the panel format or not
                        should_post = False
                        if ((response_hex.find(b'017F0247') != -1) and (response_hex.rfind(b'03') != -1)):
                            # found mobatime panel data
                            # print("Mobatime: " + str(response_hex) + " - " + str(response_hex.find(b'017F0247')))
                            # Get First and Last Usable Sequence, extract Usable String and put rest in Remainder
                            StartToken = response_hex.find(b'017F0247')
                            EndToken = response_hex.rfind(b'03')
                            # End Token + 4 because after the EndToken there is a checksum byte
                            remainder_hex = response_hex[EndToken + 4:]
                            response_hex = response_hex[StartToken:EndToken + 4] + b'017F0247'
                            # print("Mobatime: ST:" + str(StartToken) + " - ET: " + str(EndToken) + "\n" + str(response_hex) + "\n" + str(remainder_hex))
                            should_post = False
                            RetryCount = 0

                        elif (((response_hex.find(b'F83320') != -1) or (response_hex.find(b'E8E8E4') != -1)) and (response_hex.rfind(b'0D'))):
                            # found stramatel panel data - ours to forward
                            # print("Stramatel: " + str(response_hex) + " - " + str(response_hex.find(b'F83320')))
                            StartToken = max(response_hex.find(b'F83320'), response_hex.find(b'E8E8E4'))
                            EndToken = response_hex.rfind(b'0D')
                            # End Token + 2 because after the EndToken there is no checksum byte
                            remainder_hex = response_hex[EndToken + 2:]
                            response_hex = response_hex[StartToken:EndToken + 2] + b'F83320'
                            # print("Stramatel: ST:" + str(StartToken) + " - ET: " + str(EndToken) + "\n" + str(response_hex) + "\n" + str(remainder_hex))
                            RequestURL = '/api/scoreboard/ingest'
                            should_post = True
                            RetryCount = 0

                        elif (((response_hex.find(b'0254') != -1) or (response_hex.find(b'0244') != -1)) and (response_hex.rfind(b'03'))):
                            # found SwissTiming panel data
                            # print("SwissTiming: " + str(response_hex) + " - " + str(response_hex.find(b'0244')))
                            StartToken = max(response_hex.find(b'0254'), response_hex.find(b'0244'))
                            EndToken = response_hex.rfind(b'03')
                            # End Token + 4 because after the EndToken there is a checksum byte
                            remainder_hex = response_hex[EndToken + 4:]
                            response_hex = response_hex[StartToken:EndToken + 4] + b'0254'
                            # print("SwissTiming: ST:" + str(StartToken) + " - ET: " + str(EndToken) + "\n" + str(response_hex) + "\n" + str(remainder_hex))
                            should_post = False
                            RetryCount = 0
                        else:
                            # if not known format found, then retry as long there are retries left, otherwise change baudrate
                            if RetryCount < ReadRetry:
                                RetryCount += 1
                                print("\n>>> Panel not recognized. Retry #" + str(RetryCount))
                            else:    
                                # Closing Serial Interface to Change Baudrate
                                ser.close()
                                # Switch Baudrate
                                if BaudRate == 9600:
                                    BaudRate = 19200
                                elif BaudRate == 19200:
                                    BaudRate = 38400
                                elif BaudRate == 38400:
                                    BaudRate = 57600
                                elif BaudRate == 57600:
                                    BaudRate = 115200
                                elif BaudRate == 115200:
                                    BaudRate = 1200
                                elif BaudRate == 1200:
                                    BaudRate = 2400
                                elif BaudRate == 2400:
                                    BaudRate = 4800
                                elif BaudRate == 4800:
                                    BaudRate = 9600
                                else:
                                    BaudRate = 9600

                                # Set new Baudrate and re-open Serial Interface
                                ser.baudrate = BaudRate
                                ser.open()
                                print("\n>>> Panel not recognized. Changing Baudrate to " + str(BaudRate))

                            # Flush Buffers and Read to clean previous data
                            ser.flushInput()
                            ser.flushOutput()
                            response = ser.read(PackageByLength)
                            response = b''
                            remainder_hex = b''

                        # End Evaluation Block

                        if response != b'' and should_post:
                            # Make and Evaluate HTTP Request
                            headers = {}
                            headers['Content-type'] = 'application/x-www-form-urlencoded'
                            headers['Accept'] = 'text/plain'
                            headers['Content-Type'] = 'text/plain'
                            headers['Connection'] = 'keep-alive'
                            headers['Device_ID'] = Device_ID
                            headers['Authorization'] = 'Bearer ' + SCOREBOARD_KEY

                            context = ssl.create_default_context()
                            conn = http.client.HTTPSConnection(
                                RequestServer, RequestPort, timeout=RequestTimeOut, context=context,
                            )
                            conn.request("POST", RequestURL, response, headers)
                            httpreply = conn.getresponse()
                            if httpreply.status == 200:
                                fail_streak = 0
                                logging.debug(str(httpreply.status) + ' ' + str(httpreply.reason))
                            else:
                                fail_streak += 1
                                logging.error(str(httpreply.status) + ' ' + str(httpreply.reason))
                                if fail_streak >= 5:
                                    time.sleep(5)
                            RequestCount = RequestCount + 1    
                            logging.debug("RequestCount: " + str(RequestCount))
                            
                            # Calculate End Time
                            EnderTime = time.time() * 1000
                            
                            # Calculate Time used for Request Handling
                            ElapserTime = int(EnderTime - StarterTime)
                            print("\r#: " + str(RequestCount) + ", Bd: " + str(BaudRate) + ", Panel: stramatel, Len#: "
                             + str(PackageByLength) + ", HT: " + str(ElapserTime)
                             + " ms: " + str(httpreply.status) + ", Buf: " + str(ser.inWaiting()), end='          ', flush=True)
                            logging.debug("\rRequestCount: " + str(RequestCount) + ", Package Length: "
                             + str (PackageByLength) + ", Handling Time: " + str(ElapserTime)
                             + " ms -> " + str(httpreply.status) + ", BufferSize: " + str(ser.inWaiting()))        
                            
                            # Adjust PackageByLength based on Handling Time
                            if ElapserTime > 2000:
                                PackageByLength = 2048
                            elif ElapserTime > 1000:
                                PackageByLength = 1024
                            elif ElapserTime > 500:
                                PackageByLength = 512
                            elif ElapserTime > 250:
                                PackageByLength = 256
                            elif ElapserTime > 125:
                                PackageByLength = 128
                            elif ElapserTime > 60:
                                PackageByLength = 128
                            else:
                                PackageByLength = 128
                            # print("New PackageLength: " + str(PackageByLength))
                    
                    else:
                        # In case nothing is coming down the serial interface
                        print ("\rWaiting for serial input...", end='          ', flush=True)
  
            # in case that the Serial Read or HTTP request fails        
            except Exception as e1:
                print("error communicating...: " + str(e1))
                logging.error("error communicating...: " + str(e1))

        else:
            print("Port Opening Failed... trying again in 5 seconds")
            time.sleep(5)
            ser.close()
    
    except SerialException:
        print("No port connected... trying again in 5 seconds")
        time.sleep(5)
