# On-site framing scanner. Like baud-scan.py but also walks parity/stop-bit
# combinations at the low rates, printing only reads that carry a legacy
# Stramatel start token. Imported from the Pi's scratch tooling (written
# 2026-05-08); use it when baud-scan.py finds nothing and the panel might be
# speaking 7E1/7N2/8E1.
import serial

for baud in [1200, 2400, 4800, 9600]:
    for cfg in [(8, 'N', 1), (7, 'E', 1), (7, 'N', 2), (8, 'E', 1)]:
        try:
            s = serial.Serial('/dev/ttyACM0', baud, bytesize=cfg[0],
                              parity=cfg[1], stopbits=cfg[2], timeout=1)
            d = s.read(256)
            s.close()
            if b'\xf8\x33' in d or b'\xe8\xe8\xe4' in d:
                print(f'MATCH {baud} {cfg} -> {d[:60].hex()}')
        except Exception:
            pass
