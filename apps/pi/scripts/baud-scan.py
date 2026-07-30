# On-site baud-rate scanner. Walks the common rates on /dev/ttyACM0 and
# reports which one shows the legacy Stramatel start (F8 33 / E8 E8 E4) and
# CR terminator in a 256-byte read. Imported from the Pi's scratch tooling
# (written 2026-05-08 while bringing up the 452 M); run it at the gym when
# the panel does not decode and the baudrate is in doubt.
import serial

for baud in [300, 600, 1200, 2400, 4800, 9600, 19200, 38400]:
    try:
        s = serial.Serial('/dev/ttyACM0', baud, timeout=2)
        d = s.read(256)
        s.close()
        match_start = b'\xf8\x33' in d or b'\xe8\xe8\xe4' in d
        match_end = b'\x0d' in d
        flag = ' <-- MATCH' if (match_start and match_end) else ''
        print(f'{baud:6} f833={match_start} 0d={match_end} | {d[:40].hex()}{flag}')
    except Exception as e:
        print(f'{baud}: {e}')
