# Pi multi-network wifi — design

Date: 2026-07-30
Status: implemented and verified on the device, 2026-07-30

## Problem

The scoreboard Pi (`dragonspi`, Raspberry Pi 4 B, Debian 13 trixie) taps the
Stramatel console over USB-RS485 and POSTs frames to
`api.app.hbdragons.de/api/scoreboard/ingest`. It travels between venues, so it
needs to attach to whichever network is present — a gym wifi, a phone hotspot,
or a SIM router — without anyone opening a terminal. Two things fail today:

1. **No network intent.** All saved profiles sit at
   `autoconnect-priority 0`, so NetworkManager picks by signal and last-used
   rather than by preference. There is no way to say "prefer my hotspot over
   the gym wifi".
2. **No recovery.** When the radio wedges or the venue wifi has a captive
   portal, the Pi stays associated with no working uplink and nobody notices
   until the stream has no scores.

## Findings from the live box

Probed over ssh on 2026-07-30. These shaped the design and are recorded because
several contradict the repo's own docs.

| Finding | Consequence |
| --- | --- |
| NetworkManager 1.52, `wlan0` only, `eth0` unused, avahi active | nmcli is the single control surface |
| `netplan-wlan0-NLan.nmconnection` lives in `/run/NetworkManager/system-connections/`, regenerated each boot by `/usr/lib/aarch64-linux-gnu/netplan/generate` from `/etc/netplan/90-NM-4ef6401e-….yaml` | nmcli edits to that profile are not guaranteed to survive a reboot — wifi must move off netplan |
| `10001` and `Y800Z_DA89` are plain keyfiles in `/etc/NetworkManager/system-connections/` | two owners for wifi config; unify on keyfiles |
| `10001` has `hidden=true` | the network list needs a per-entry hidden flag; NM must actively probe |
| Vendor ships `/usr/lib/NetworkManager/conf.d/no-mac-addr-change.conf` and `rpi-no-scan-rand-mac-address.conf` | MAC randomisation is already off — do not add redundant config |
| No files in `/etc/NetworkManager/conf.d/` | `wifi.powersave` is at its default (on) |
| `tailscale ping dragonspi` → 99 ms over a **direct LAN** path | power-save is parking the radio; this is the latency, not distance |
| `iw` is not installed | `wifi.powersave` via NM config is the only lever, which is the correct one anyway |
| Deployed at `/home/hb/Panel2Net`, venv `.venv/bin/python3`, unit `User=hb` | `apps/pi/README.md` says `/home/pi`, `sudo pip3 install`, `User=pi` — drifted |
| Tailscale up on the Pi (`100.125.219.119`, `RunSSH: true`, `tailscaled` enabled) and on the mac (`mb-1`); `ssh hb@100.125.219.119` succeeds | out-of-band access exists, so the netplan cutover cannot lock anyone out |

Out of scope, flagged only: the Pi carries `Panel2Net.py.bak-preconnreuse` and
`parity.py`, neither in the repo, and its `Panel2Net.py` is dated later than the
committed copy. Possible code drift, to be reconciled separately.

## Approach

Four new files in `apps/pi`, following the existing `panel_pipeline.py` (pure,
tested) / `Panel2Net.py` (I/O) split so the decision logic is covered by pytest
and the CI job that already runs it.

```
apps/pi/net_policy.py              pure: state -> list of actions, no I/O
apps/pi/net_watchdog.py            I/O: probes, nmcli, state file
apps/pi/setup_network.py           idempotent provisioner, --dry-run
apps/pi/networks.conf.example      network list template
apps/pi/net-watchdog.service       Type=oneshot, StateDirectory=panel2net
apps/pi/net-watchdog.timer         OnUnitActiveSec=60s (monotonic)
apps/pi/tests/test_net_policy.py
apps/pi/tests/test_setup_network.py
```

### Network list

`/home/hb/Panel2Net/networks.conf`, mode `0600`, gitignored. One entry per
line, `ssid|priority|psk|hidden`:

```
JN-iPhone|100|<psk>|no
10001|90|<psk>|yes
Y800Z_DA89|80|<psk>|no
NLan|50|<psk>|no
```

**Hotspots take the highest priority deliberately.** A hotspot only exists
while someone toggles it on, so enabling it becomes the manual override. Venue
and home wifi sit lower as the standing fallback.

Corrected after testing on the device: the override runs through the watchdog,
not through NetworkManager. NM evaluates `autoconnect-priority` when a device is
disconnected and choosing a candidate; it does not preempt a healthy connection
because a better-ranked one has appeared. Switching the hotspot on while the Pi
is happily associated moves nothing — verified over three minutes. The path that
does work is the demotion rung: the current network stops passing probes, gets
demoted, and the hotspot wins the reselection.

Where NM does honour priority is a cold start with nothing associated, which is
the arriving-at-a-venue case. With home wifi out of the candidate set it joined
the hidden hotspot 3 s after the radio came back. Two caveats measured alongside
that: when home wifi *is* also in range it wins, because it broadcasts and a
hidden SSID needs a directed probe that has not completed when NM commits about
2.5 s in; and an explicit `nmcli con down` leaves the device's autoconnect
blocked, so NM sits idle until something clears it. The first is harmless — a
working network is a working network, and the watchdog moves off it if it stops
passing probes. The second is what the connect rung covers.

### `setup_network.py`

Reads the list and converges NetworkManager to match. Idempotent — matches
existing profiles by connection id (= SSID) and modifies rather than
duplicating, so it can be re-run after an edit or an SD-card reflash. It never
deletes a profile it does not know about.

Per profile:

| Setting | Value | Reason |
| --- | --- | --- |
| `connection.autoconnect-priority` | from the list | expresses intent; the missing piece today |
| `connection.autoconnect-retries` | `0` | retry forever; the default of 4 is why a long outage leaves the profile dead |
| `wifi.hidden` | from the list | `10001` needs active probing |
| `ipv6.may-fail` | `yes` | a dead IPv6 must not fail activation |
| `ipv4.dhcp-timeout` | `45` | slow venue DHCP |
| `connection.mdns` | `2` | keeps `dragonspi.local` as a secondary path |

Global, `/etc/NetworkManager/conf.d/10-dragons.conf`:

```ini
[connection]
wifi.powersave = 2
```

`2` is "disabled". This is the single highest-value change — the 99 ms
direct-LAN round trip above is power-save latency, and the same mechanism
produces multi-second stalls and silent drops mid-game.

`--dry-run` prints the nmcli commands instead of running them, which is what
`test_setup_network.py` asserts against a sample list. That keeps the
config-parsing and command-generation logic under test without needing a live
NetworkManager.

### Watchdog

A `oneshot` unit on a 60 s timer. Two-tier probe, and the order is the point:

1. generic internet — `HEAD` against two `generate_204` endpoints run by
   different operators, counted as a failure only when neither answers. The
   single endpoint this originally named, `connectivity-check.gstatic.com`, does
   not resolve at all; Google's live name is `connectivitycheck.gstatic.com`. A
   probe host that silently stops existing would otherwise drive the ladder
   forever.
2. the API — `GET https://api.app.hbdragons.de/health`

**Internet reachable but API down means log and change nothing.** An API
outage is not a wifi fault; without this rule the watchdog would cycle the
radio through every deployment and every backend incident, including mid-game.

Escalation runs on consecutive *internet* failures. State in
`/var/lib/panel2net/net-watchdog.json`.

| Consecutive failures | Action |
| --- | --- |
| 1–2 | log only |
| 3 | `nmcli dev wifi rescan`, log visible SSIDs — catches a hotspot the moment it is switched on. Also, if no profile is active at all, activate the best available one |
| 5 | demote the current SSID (`autoconnect no` plus a penalty timestamp), then activate the highest-priority remaining profile that comes up. Penalty expires after 10 min. |
| 10 | `nmcli radio wifi off`, wait 5 s, `on` |
| 20 | `systemctl restart NetworkManager` |

No reboot at any step. Beyond the table the ladder repeats on multiples, and
each rung fires the strongest single action rather than several at once: 15
demotes again, 25 demotes, 30 cycles the radio, 40 restarts NetworkManager. A
rescan runs on every failure from 3 onward, since it costs nothing and is what
catches a hotspot the moment it appears.

A success clears the failure counter. It deliberately does **not** clear
outstanding penalties — those expire on their own 10 minute timer. Lifting a
penalty the instant something else works would re-admit a network the Pi just
proved broken, and if that network outranked the working one NM would jump
straight back to it and flap.

The demotion step is what makes a **captive-portal venue wifi** survivable: the
Pi associates, gets a lease, has no usable uplink, and would otherwise sit there
indefinitely because NM considers it connected.

Two things about that step only showed up on the device, and both made the rung
useless or harmful before they were fixed:

- `nmcli device connect` deliberately considers profiles whose autoconnect is
  off, so demoting a profile and then calling it re-selected the profile just
  demoted. The watchdog names its replacement instead.
- Ranking candidates by priority alone assumes the best-ranked network is in
  range. It usually is not — the first attempt went to a venue SSID that was not
  there, failed, and left the Pi associated with nothing. The watchdog now walks
  the ranking until one activates. Filtering the list by scan visibility was
  rejected: a hidden network never appears in scan results, which would rule out
  the hotspot permanently.

`net_policy.decide(consecutive_failures, internet_ok, api_ok, current_ssid,
penalties, now)` returns an ordered action list and performs no I/O — that is
where the tests concentrate. `net_watchdog.py` only executes what it is handed.

### Access

Tailscale is already configured on both ends and needs no scripting, only
documentation. Access is deliberately split across two ssh aliases on the
operator's machine:

| Alias | HostName | Use |
| --- | --- | --- |
| `dragonspi` | `10.168.100.32` | the home wifi only, kept as the low-latency local path |
| `dragonstail` | `dragonspi.tail5a9cb.ts.net` | every other network the Pi roams to |

`dragonstail` uses the MagicDNS FQDN rather than the bare host name, because
the tailnet reports no search domains and the bare name only resolves while
Tailscale owns the resolver. It sets `StrictHostKeyChecking accept-new` —
Tailscale SSH presents its own host key, distinct from the Pi's sshd key — and
`ServerAliveInterval 30` so a session dies rather than hanging when the Pi
changes network. The `IdentityFile` is a fallback; with `RunSSH: true` the
tailnet ACL performs the authentication.

Added 2026-07-30 and verified: `100.116.52.103` → `100.125.219.119`.

## Cutover order

Wifi must leave netplan's ownership, and the profile being replaced is the one
currently carrying the ssh session. Sequenced so no step can strand the box:

1. Confirm `ssh dragonstail` over the tailnet (done 2026-07-30). Every later
   step is performed over that alias, never over `dragonspi`, because the
   profile being replaced is the one carrying the LAN session.
2. Write `networks.conf`, run `setup_network.py --dry-run`, read the commands.
3. Apply. This creates an `NLan` keyfile profile at priority 50 alongside the
   netplan one.
4. Confirm the keyfile profile activates and survives a reboot.
5. Only then delete `/etc/netplan/90-NM-4ef6401e-….yaml`. Keep the `eth0`
   netplan file — `eth0` is unused and it does no harm.
6. Install and enable the watchdog timer; verify the ladder by blocking the
   probe host.

## Testing

- `test_net_policy.py` — table-driven over the ladder: each threshold, penalty
  expiry, the internet-up/API-down no-op, and counter reset on success.
- `test_setup_network.py` — parses a sample `networks.conf` and asserts the
  generated command list, including the hidden flag and priority ordering;
  covers malformed lines and a missing psk.
- `pytest` from `apps/pi`, which the existing CI job already runs.

## Documentation

`apps/pi/README.md` gains the network setup, watchdog install and Tailscale
access sections, and its install paths are corrected to the deployed reality
(`/home/hb/Panel2Net`, venv, `User=hb`).

## Limits

- iOS stops broadcasting a hotspot SSID after a spell with no client attached.
  The 60 s rescan usually catches the window; leaving the Personal Hotspot
  screen open shortens the wait.
- Tailscale needs some working uplink. On a fully captive-portalled venue wifi
  only step 5 of the ladder — demote and switch to a hotspot — restores access.
- A hard `wlan0` firmware crash is still beyond the watchdog and needs a power
  cycle.
