# Pi ingest (`@dragons/pi`)

Slim payload that runs on a Raspberry Pi connected via USB-RS485 to a
Stramatel basketball console. Captures serial frames and POSTs raw hex to
`api.app.hbdragons.de/api/scoreboard/ingest`.

## Hardware

- Raspberry Pi (3 B+ or 4 B), 5.1 V / 3 A PSU, microSD ≥ 16 GB.
- USB serial tap into the console's data line. `Panel2Net.py` opens
  `/dev/ttyACM0` and nothing else, so the adapter must enumerate as CDC-ACM —
  the one that carried live games does. An FTDI, CH340 or CP2102 adapter
  enumerates as `/dev/ttyUSB0` instead and would never be opened; do not
  substitute one on game day.
- Plugging the adapter in after boot is fine: the service retries the port
  every 5 s until it opens.
- Cable tapping the data line between the Stramatel console and its LED panel.
- `pyserial` is the only Python dependency.
- `scripts/baud-scan.py` and `scripts/baud-scan-parity.py` are on-site
  scanners for when the panel stops decoding and the framing is in doubt.

## Install

The deployed copy lives at `/home/hb/Panel2Net` and runs as `hb` from a venv.

```bash
sudo apt install -y python3-venv
sudo -u hb mkdir -p /home/hb/Panel2Net
sudo -u hb python3 -m venv /home/hb/Panel2Net/.venv
sudo cp Panel2Net.py panel_pipeline.py net_policy.py net_watchdog.py setup_network.py /home/hb/Panel2Net/
sudo chown hb:hb /home/hb/Panel2Net/*.py
sudo cp panel2net.service /etc/systemd/system/
sudo cp Panel2Net.id.example /home/hb/Panel2Net/Panel2Net.id  # then edit
sudo install -m 0600 scoreboard.key.example /home/hb/Panel2Net/scoreboard.key  # then paste real key
sudo -u hb /home/hb/Panel2Net/.venv/bin/pip install -r requirements.txt
sudo systemctl daemon-reload
sudo systemctl enable --now panel2net.service
```

## Wifi

The Pi moves between venues, so the networks it may join are listed in
`/home/hb/Panel2Net/networks.conf` (mode `0600`, never committed) and applied
with `setup_network.py`:

```bash
sudo cp networks.conf.example /home/hb/Panel2Net/networks.conf
sudo chmod 0600 /home/hb/Panel2Net/networks.conf
sudoedit /home/hb/Panel2Net/networks.conf          # fill in the real keys
cd /home/hb/Panel2Net
sudo .venv/bin/python3 setup_network.py --dry-run  # prints nmcli calls, psk redacted
sudo .venv/bin/python3 setup_network.py
```

Format is `ssid|priority|psk|hidden`. Higher priority wins when several networks
are in range, and hotspots are listed above venue wifi deliberately: a hotspot
only exists while someone switches it on, so switching it on is the manual
override that pulls the Pi off the venue network. Set `hidden` to `yes` for a
network that does not broadcast its SSID — NetworkManager only probes for those
when the flag is set.

Re-running `setup_network.py` is safe. It matches profiles by connection id,
modifies them in place, and never deletes a profile it did not create.

It also writes `/etc/NetworkManager/conf.d/10-dragons.conf` to turn
`wifi.powersave` off. Leave that in place — with power-save on, the Pi's
brcmfmac driver parks the radio between beacons, which shows up as multi-second
stalls and dropped POSTs.

## Watchdog

`net-watchdog.timer` probes the uplink every 60 s and recovers the wifi without
rebooting.

```bash
sudo cp net-watchdog.service net-watchdog.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now net-watchdog.timer
systemctl list-timers net-watchdog.timer
journalctl -u net-watchdog.service -f
```

It probes generic internet first and the API second. **An API outage with a
working uplink is logged and otherwise ignored** — that is not a wifi fault, and
acting on it would cycle the radio during every deployment.

The internet probe asks two `generate_204` endpoints run by different operators
and counts a failure only when neither answers. One name being blocked or
retired must not be enough to make the ladder tear down a working network.

Arriving somewhere new, the Pi normally needs no help: NetworkManager's own
autoconnect joined a hidden, top-priority hotspot 3 s after a cold radio when
nothing else was reachable. The one state it does not recover from is a device
whose autoconnect NM has blocked, which is what an explicit `nmcli con down`
leaves behind. So from 3 failures onward, a Pi holding no profile at all is told
to activate the best available one rather than waiting for the NM restart at 20.

On consecutive internet failures: 3 rescans, 5 demotes the current network for
10 minutes and activates the highest-priority profile that is left, 10 cycles
the radio, 20 restarts NetworkManager. Past that the ladder repeats. It never
reboots. The demotion rung is what recovers from a venue wifi with a captive
portal, where the Pi holds a lease but has no usable uplink.

The replacement profile is named explicitly rather than handed to `nmcli device
connect`. That command considers profiles whose autoconnect is off, so it
re-selects the network just demoted and the rung does nothing — confirmed on the
Pi before this was fixed.

The watchdog then works down the remaining profiles by priority until one
activates, rather than trying only the best-ranked one. Priority says nothing
about whether a network is in range, and the top-ranked profile is usually a
hotspot or a venue that is not there. Filtering the list by what a scan can see
is not an option either: a hidden network never appears in scan results, which
would rule out the hotspot permanently.

State lives in `/var/lib/panel2net/net-watchdog.json`. A dry run shows what it
would do and changes nothing:

```bash
cd /home/hb/Panel2Net && sudo .venv/bin/python3 net_watchdog.py --dry-run
```

## Access

Two ssh aliases, on purpose:

| Alias | Path | Use |
| --- | --- | --- |
| `dragonspi` | `10.168.100.32` | the home wifi only, the low-latency local route |
| `dragonstail` | `dragonspi.tail5a9cb.ts.net` | every other network the Pi roams to |

Tailscale runs with Tailscale SSH enabled (`tailscale up --ssh
--hostname=dragonspi`), so `dragonstail` works from any network without a port
forward. Use it for anything that touches wifi configuration — `dragonspi` is
carried by the very connection such a change can drop.

## Layout

- `Panel2Net.py` — the service: serial port, retry/baudrate walk, HTTP POST.
- `panel_pipeline.py` — the pure transformation from serial bytes to POST body
  and headers. No I/O, so it is testable; `Panel2Net.py` calls it per read.
- `scripts/replay-pipeline.py` — prints the bodies a capture would produce.
- `setup_network.py` — applies `networks.conf` to NetworkManager. Parsing and
  command building are pure; only `main()` touches the box.
- `net_policy.py` — the watchdog ladder. Probe results plus prior state in,
  ordered actions out. No I/O, so it is testable.
- `net_watchdog.py` — the watchdog's I/O half: probes, `nmcli`, state file.

## Tests

```bash
pip install -r requirements-dev.txt
pytest                     # from apps/pi
```

`apps/api/src/services/scoreboard/pi-pipeline.test.ts` runs the same
`panel_pipeline.replay` over a committed capture and feeds the result to the
API's decoder, so a change here that corrupts frames fails the API suite too.
It needs `python3` on PATH.

## Key rotation

1. On the API host: regenerate `SCOREBOARD_INGEST_KEY` and redeploy.
2. On the Pi: replace the contents of `/home/hb/Panel2Net/scoreboard.key` and run `sudo systemctl restart panel2net.service`.

## Logs

`/tmp/Panel2Net.log` (rotates on every start). For live tailing run `journalctl -u panel2net.service -f`.
