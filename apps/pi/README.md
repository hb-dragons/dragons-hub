# Pi ingest (`@dragons/pi`)

Slim payload that runs on a Raspberry Pi connected via USB-RS485 to a
Stramatel basketball console. Captures serial frames and POSTs raw hex to
`api.app.hbdragons.de/api/scoreboard/ingest`.

## Hardware

- Raspberry Pi (3 B+ or 4 B), 5.1 V / 3 A PSU, microSD ≥ 16 GB.
- USB to RS-485 adapter (FTDI, CH340 or CP2102 chipset).
- Cable tapping the data line between the Stramatel console and its LED panel.
- `pyserial` is the only Python dependency.

## Install

```bash
sudo apt install -y python3-pip
sudo mkdir -p /home/pi/Panel2Net
sudo cp Panel2Net.py /home/pi/Panel2Net/
sudo cp panel2net.service /etc/systemd/system/
sudo cp Panel2Net.id.example /home/pi/Panel2Net/Panel2Net.id  # then edit
sudo install -m 0600 scoreboard.key.example /home/pi/Panel2Net/scoreboard.key  # then paste real key
sudo pip3 install -r requirements.txt
sudo systemctl daemon-reload
sudo systemctl enable --now panel2net.service
```

## Key rotation

1. On the API host: regenerate `SCOREBOARD_INGEST_KEY` and redeploy.
2. On the Pi: replace the contents of `/home/pi/Panel2Net/scoreboard.key` and run `sudo systemctl restart panel2net.service`.

## Logs

`/tmp/Panel2Net.log` (rotates on every start). For live tailing run `journalctl -u panel2net.service -f`.
