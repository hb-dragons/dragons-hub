# Pi Multi-Network Wifi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the scoreboard Pi a priority-ordered list of wifi networks it joins unattended, plus a watchdog that recovers the uplink without a reboot.

**Architecture:** Two pure modules carry all the logic and all the tests (`net_policy.py` for the watchdog ladder, the parse/build half of `setup_network.py` for provisioning); two thin I/O layers execute what they decide (`net_watchdog.py`, `setup_network.main`). This mirrors the existing `panel_pipeline.py` (pure, tested) / `Panel2Net.py` (I/O) split in the same directory. NetworkManager is driven exclusively through `nmcli`, and wifi moves off netplan onto plain keyfiles so edits survive a reboot.

**Tech Stack:** Python 3 standard library only (`urllib.request`, `subprocess`, `json`, `argparse`), pytest, systemd (`oneshot` service + monotonic timer), NetworkManager 1.52 via `nmcli`.

**Spec:** `docs/superpowers/specs/2026-07-30-pi-multi-network-wifi-design.md`

## Global Constraints

- **Standard library only.** `apps/pi/requirements.txt` is `pyserial>=3.5` and `requirements-dev.txt` is `pytest>=8.0`. Do not add a dependency — no `requests`, no `PyYAML`.
- **Python 3.12 in CI, 3.14 on the Pi.** Code must run on both. No syntax newer than 3.12.
- **CI runs `pytest` from `apps/pi`** with `pytest.ini` (`testpaths = tests`, `pythonpath = .`), so test modules import the modules under test directly: `import net_policy`.
- **Tests live in `apps/pi/tests/`**, named `test_<module>.py`. This differs from the monorepo's co-located TS convention — follow the existing Python layout.
- **`pnpm check:ai-slop` scans `.md` files.** The banned-phrase list is in `CLAUDE.md` under "Writing Style Rules" — read it there rather than reproducing it, since quoting the list verbatim in a `.md` file fails the check.
- **`pnpm check:skipped-tests` also walks `apps/pi` pytest files.** Any skip needs an issue reference.
- **Never print or log a PSK.** Redaction is required in `--dry-run` output and in every log line.
- **No `Co-Authored-By` or AI-credit trailers in commits.**
- **`wlan0`** is the only wifi device. **`/home/hb/Panel2Net`** is the deploy path, **`.venv/bin/python3`** the interpreter, **`hb`** the `panel2net.service` user. The watchdog runs as root (it calls `nmcli con mod` and `systemctl restart`).
- Work on branch `feat/pi-multi-network-wifi`, which already holds the spec commits.

## File Structure

| File | Responsibility |
| --- | --- |
| `apps/pi/net_policy.py` | Pure. Probe results + prior state → ordered action list. No subprocess, no network, no clock. |
| `apps/pi/net_watchdog.py` | I/O. HTTP probes, `nmcli`/`systemctl` calls, state file, logging. Calls `net_policy.decide`. |
| `apps/pi/setup_network.py` | Pure `parse_networks` / `commands_for` / `redact` plus a `main()` that applies them. One file — the pure core is ~60 lines and splitting it would separate two halves that always change together. |
| `apps/pi/networks.conf.example` | Template for the gitignored `networks.conf`. Mirrors `scoreboard.key.example`. |
| `apps/pi/net-watchdog.service` | `oneshot` unit, `StateDirectory=panel2net`. |
| `apps/pi/net-watchdog.timer` | Monotonic 60 s timer. |
| `apps/pi/tests/test_net_policy.py` | The ladder, penalty expiry, the API-down no-op. |
| `apps/pi/tests/test_setup_network.py` | Config parsing errors, command building, PSK redaction. |
| `apps/pi/README.md` | Modify: correct the drifted install paths, add network/watchdog/access sections. |
| `.gitignore` | Modify: add `apps/pi/networks.conf`. |

Task order follows deployment order: the provisioner exists before the watchdog that depends on the profiles it creates, and the runbook comes last.

---

### Task 1: Network list and provisioner

**Files:**
- Create: `apps/pi/setup_network.py`
- Create: `apps/pi/networks.conf.example`
- Create: `apps/pi/tests/test_setup_network.py`
- Modify: `.gitignore` (append one line)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `class Network` with attributes `ssid: str`, `priority: int`, `psk: str`, `hidden: bool`
  - `class ConfigError(Exception)`
  - `parse_networks(text: str) -> list[Network]` — raises `ConfigError` with a 1-based line number
  - `commands_for(network: Network, exists: bool) -> list[list[str]]`
  - `redact(command: list[str]) -> list[str]`
  - `POWERSAVE_CONF: str`, `POWERSAVE_CONF_PATH: str`, `WIFI_DEVICE = 'wlan0'`
  - `main(argv: list[str] | None = None) -> int`

- [ ] **Step 1: Write the failing tests**

Create `apps/pi/tests/test_setup_network.py`:

```python
"""Tests for the networks.conf parser and the nmcli command builder.

Both halves are pure, so a live NetworkManager is never needed. The command
lists asserted here are what setup_network.main hands to subprocess.run, so a
change to a property name shows up as a failing assertion rather than as a Pi
that silently keeps its old settings.
"""

import pytest

import setup_network

VALID = """\
# comment line
JN-iPhone|100|hotspotsecret|no

10001|90|routersecret|yes
NLan|50|homesecret|no
"""


def test_parse_returns_one_network_per_data_line():
    networks = setup_network.parse_networks(VALID)
    assert [n.ssid for n in networks] == ['JN-iPhone', '10001', 'NLan']
    assert [n.priority for n in networks] == [100, 90, 50]
    assert [n.hidden for n in networks] == [False, True, False]
    assert networks[0].psk == 'hotspotsecret'


def test_parse_tolerates_surrounding_whitespace():
    networks = setup_network.parse_networks('  Gym | 40 | secret | no  \n')
    assert networks[0].ssid == 'Gym'
    assert networks[0].priority == 40
    assert networks[0].psk == 'secret'


@pytest.mark.parametrize('text, fragment', [
    ('JN-iPhone|100|secret\n', 'expected ssid|priority|psk|hidden'),
    ('|100|secret|no\n', 'empty ssid'),
    ('JN-iPhone|high|secret|no\n', "priority 'high' is not a number"),
    ('JN-iPhone|100||no\n', 'empty psk'),
    ('JN-iPhone|100|secret|maybe\n', "hidden must be 'yes' or 'no'"),
])
def test_parse_rejects_malformed_lines(text, fragment):
    with pytest.raises(setup_network.ConfigError) as caught:
        setup_network.parse_networks(text)
    assert fragment in str(caught.value)
    assert 'line 1' in str(caught.value)


def test_parse_reports_the_offending_line_number():
    text = '# note\nGood|10|secret|no\nBad|10|secret\n'
    with pytest.raises(setup_network.ConfigError) as caught:
        setup_network.parse_networks(text)
    assert 'line 3' in str(caught.value)


def test_parse_rejects_a_duplicate_ssid():
    text = 'Gym|40|secret|no\nGym|30|secret|no\n'
    with pytest.raises(setup_network.ConfigError) as caught:
        setup_network.parse_networks(text)
    assert 'duplicate' in str(caught.value)


def test_parse_rejects_a_file_with_no_networks():
    with pytest.raises(setup_network.ConfigError) as caught:
        setup_network.parse_networks('# only a comment\n\n')
    assert 'no networks configured' in str(caught.value)


def test_a_new_profile_is_added_then_modified():
    network = setup_network.Network('Gym', 40, 'secret', False)
    commands = setup_network.commands_for(network, exists=False)
    assert len(commands) == 2
    assert commands[0][:4] == ['nmcli', 'con', 'add', 'type']
    assert 'con-name' in commands[0]
    assert commands[0][commands[0].index('ifname') + 1] == 'wlan0'
    assert commands[1][:4] == ['nmcli', 'con', 'mod', 'Gym']


def test_an_existing_profile_is_only_modified():
    network = setup_network.Network('Gym', 40, 'secret', False)
    commands = setup_network.commands_for(network, exists=True)
    assert len(commands) == 1
    assert commands[0][:4] == ['nmcli', 'con', 'mod', 'Gym']


def test_the_modify_command_carries_every_hardening_setting():
    network = setup_network.Network('Gym', 40, 'secret', True)
    command = setup_network.commands_for(network, exists=True)[0]
    pairs = dict(zip(command[4::2], command[5::2]))
    assert pairs['connection.autoconnect-priority'] == '40'
    assert pairs['connection.autoconnect-retries'] == '0'
    assert pairs['connection.autoconnect'] == 'yes'
    assert pairs['802-11-wireless.hidden'] == 'yes'
    assert pairs['802-11-wireless-security.key-mgmt'] == 'wpa-psk'
    assert pairs['802-11-wireless-security.psk'] == 'secret'
    assert pairs['connection.mdns'] == '2'
    assert pairs['ipv4.dhcp-timeout'] == '45'
    assert pairs['ipv6.may-fail'] == 'yes'


def test_a_visible_network_sets_hidden_to_no():
    network = setup_network.Network('Gym', 40, 'secret', False)
    command = setup_network.commands_for(network, exists=True)[0]
    assert command[command.index('802-11-wireless.hidden') + 1] == 'no'


def test_redact_hides_the_psk():
    network = setup_network.Network('Gym', 40, 'secret', False)
    command = setup_network.commands_for(network, exists=True)[0]
    assert 'secret' not in setup_network.redact(command)
    assert setup_network.REDACTED in setup_network.redact(command)


def test_redact_only_hides_the_value_after_the_psk_key():
    # A psk that happens to equal another value on the command line must not
    # cause that other value to be redacted too.
    network = setup_network.Network('Gym', 40, 'yes', False)
    command = setup_network.commands_for(network, exists=True)[0]
    redacted = setup_network.redact(command)
    assert redacted[redacted.index('802-11-wireless-security.psk') + 1] == setup_network.REDACTED
    assert redacted[redacted.index('connection.autoconnect') + 1] == 'yes'


def test_the_powersave_conf_disables_powersave():
    assert '[connection]' in setup_network.POWERSAVE_CONF
    assert 'wifi.powersave = 2' in setup_network.POWERSAVE_CONF
    assert setup_network.POWERSAVE_CONF_PATH == '/etc/NetworkManager/conf.d/10-dragons.conf'
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/pi && pytest tests/test_setup_network.py -v`
Expected: collection error, `ModuleNotFoundError: No module named 'setup_network'`

- [ ] **Step 3: Write `apps/pi/setup_network.py`**

```python
#!/usr/bin/env python3
# Converge NetworkManager onto the network list in networks.conf.
#
# The parsing and the command building are pure functions, so the tests cover
# them without a live NetworkManager; main() is the only part that touches the
# box. Re-running is safe: profiles are matched by connection id (which is the
# SSID) and modified in place, and nothing this script did not create is ever
# deleted.
#
# Why keyfiles and not netplan: on this Pi the wifi profile was owned by netplan
# and materialised into /run/NetworkManager/system-connections/, regenerated from
# /etc/netplan on every boot, so nmcli edits to it were not durable. See the
# design doc for the cutover.

import argparse
import os
import subprocess
import sys

WIFI_DEVICE = 'wlan0'
DEFAULT_CONF = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'networks.conf')
POWERSAVE_CONF_PATH = '/etc/NetworkManager/conf.d/10-dragons.conf'

# wifi.powersave 2 is "disabled". The Pi's brcmfmac power-save parks the radio
# between beacons, which surfaces as multi-second stalls and silent drops; a
# direct-LAN round trip to this box measured 99 ms with it left on.
POWERSAVE_CONF = '''[connection]
wifi.powersave = 2
'''

REDACTED = '<psk>'

FIELD_HELP = 'expected ssid|priority|psk|hidden'


class ConfigError(Exception):
    """A line of networks.conf that cannot be used."""


class Network:
    """One entry of networks.conf."""

    __slots__ = ('ssid', 'priority', 'psk', 'hidden')

    def __init__(self, ssid, priority, psk, hidden):
        self.ssid = ssid
        self.priority = priority
        self.psk = psk
        self.hidden = hidden

    def __eq__(self, other):
        if not isinstance(other, Network):
            return NotImplemented
        return (self.ssid, self.priority, self.psk, self.hidden) == \
               (other.ssid, other.priority, other.psk, other.hidden)

    def __repr__(self):
        # The psk is deliberately absent: this object ends up in log lines and
        # pytest failure output.
        return 'Network(ssid=%r, priority=%r, hidden=%r)' % (
            self.ssid, self.priority, self.hidden)


def parse_networks(text):
    """Parse networks.conf into Network objects, in file order.

    Raises ConfigError naming the 1-based line number, because this file is
    hand-edited over ssh and a silent misparse would mean a Pi that quietly
    fails to join a network at a match.
    """
    networks = []
    seen = set()
    for number, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith('#'):
            continue

        fields = [field.strip() for field in line.split('|')]
        if len(fields) != 4:
            raise ConfigError('line %d: %s, got %d field(s)'
                              % (number, FIELD_HELP, len(fields)))
        ssid, priority, psk, hidden = fields

        if not ssid:
            raise ConfigError('line %d: empty ssid' % number)
        if ssid in seen:
            raise ConfigError('line %d: duplicate ssid %r' % (number, ssid))
        try:
            priority_value = int(priority)
        except ValueError:
            raise ConfigError('line %d: priority %r is not a number'
                              % (number, priority)) from None
        if not psk:
            raise ConfigError('line %d: empty psk for %r' % (number, ssid))
        if hidden not in ('yes', 'no'):
            raise ConfigError("line %d: hidden must be 'yes' or 'no', got %r"
                              % (number, hidden))

        seen.add(ssid)
        networks.append(Network(ssid, priority_value, psk, hidden == 'yes'))

    if not networks:
        raise ConfigError('no networks configured')
    return networks


def commands_for(network, exists):
    """nmcli invocations that bring one profile to the configured state.

    A profile that does not exist yet is created bare and then configured by the
    same modify command an existing profile gets, so there is one place where
    settings are declared.
    """
    commands = []
    if not exists:
        commands.append([
            'nmcli', 'con', 'add', 'type', 'wifi',
            'con-name', network.ssid,
            'ifname', WIFI_DEVICE,
            'ssid', network.ssid,
        ])
    commands.append([
        'nmcli', 'con', 'mod', network.ssid,
        '802-11-wireless-security.key-mgmt', 'wpa-psk',
        '802-11-wireless-security.psk', network.psk,
        # NetworkManager only probes for a non-broadcasting SSID when this is set.
        '802-11-wireless.hidden', 'yes' if network.hidden else 'no',
        'connection.autoconnect', 'yes',
        # The missing piece before this script: every profile sat at 0, so NM
        # chose by signal and last-used rather than by intent.
        'connection.autoconnect-priority', str(network.priority),
        # 0 is "retry forever". The default of 4 is why a long outage left a
        # profile dead until someone intervened.
        'connection.autoconnect-retries', '0',
        # 2 is "yes": keeps dragonspi.local working as a secondary path.
        'connection.mdns', '2',
        'ipv4.dhcp-timeout', '45',
        # A venue with broken IPv6 must not fail activation outright.
        'ipv6.may-fail', 'yes',
    ])
    return commands


def redact(command):
    """The command with any psk value replaced, for printing and logging.

    Keyed on the preceding property name rather than on the secret's value, so a
    psk that happens to equal another argument cannot redact the wrong field.
    """
    out = []
    hide_next = False
    for part in command:
        if hide_next:
            out.append(REDACTED)
            hide_next = False
            continue
        out.append(part)
        hide_next = part.endswith('.psk')
    return out


def existing_profiles():
    """Connection ids NetworkManager already knows."""
    completed = subprocess.run(
        ['nmcli', '-t', '-f', 'NAME', 'con', 'show'],
        capture_output=True, text=True, check=True, timeout=20)
    return {line.strip() for line in completed.stdout.splitlines() if line.strip()}


def main(argv=None):
    parser = argparse.ArgumentParser(
        description='Converge NetworkManager onto networks.conf.')
    parser.add_argument('--conf', default=DEFAULT_CONF,
                        help='path to networks.conf (default: next to this script)')
    parser.add_argument('--dry-run', action='store_true',
                        help='print the nmcli calls with the psk redacted and change nothing')
    args = parser.parse_args(argv)

    try:
        with open(args.conf) as handle:
            networks = parse_networks(handle.read())
    except OSError as exc:
        print('cannot read %s: %s' % (args.conf, exc), file=sys.stderr)
        return 1
    except ConfigError as exc:
        print('%s: %s' % (args.conf, exc), file=sys.stderr)
        return 1

    try:
        existing = existing_profiles()
    except (OSError, subprocess.SubprocessError) as exc:
        if not args.dry_run:
            print('cannot list NetworkManager profiles: %s' % exc, file=sys.stderr)
            return 1
        print('# nmcli unavailable, assuming no profile exists yet')
        existing = set()

    for network in networks:
        for command in commands_for(network, network.ssid in existing):
            if args.dry_run:
                print(' '.join(redact(command)))
                continue
            try:
                subprocess.run(command, check=True, timeout=60)
            except (OSError, subprocess.SubprocessError) as exc:
                print('%s: %s failed: %s'
                      % (network.ssid, ' '.join(redact(command)), exc), file=sys.stderr)
                return 1
        if not args.dry_run:
            print('%s: priority %d, hidden %s'
                  % (network.ssid, network.priority, 'yes' if network.hidden else 'no'))

    if args.dry_run:
        print('# would write %s:' % POWERSAVE_CONF_PATH)
        print(POWERSAVE_CONF.rstrip())
        return 0

    try:
        with open(POWERSAVE_CONF_PATH, 'w') as handle:
            handle.write(POWERSAVE_CONF)
    except OSError as exc:
        print('cannot write %s: %s' % (POWERSAVE_CONF_PATH, exc), file=sys.stderr)
        return 1
    print('wrote %s' % POWERSAVE_CONF_PATH)
    subprocess.run(['systemctl', 'reload', 'NetworkManager'], check=False, timeout=60)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/pi && pytest tests/test_setup_network.py -v`
Expected: PASS, 17 tests (5 of them from the malformed-line parametrisation)

- [ ] **Step 5: Write `apps/pi/networks.conf.example`**

```
# Wifi networks the Pi may join, one per line:
#
#   ssid|priority|psk|hidden
#
# Higher priority wins when several are in range. Hotspots sit above venue wifi
# on purpose: a hotspot only exists while someone switches it on, so switching
# it on becomes the manual override that pulls the Pi off the venue network.
#
# hidden must be yes for a network that does not broadcast its SSID — 10001 is
# one. NetworkManager only probes for those when the flag is set.
#
# Copy to networks.conf next to setup_network.py, fill in the real keys, then:
#   sudo chmod 0600 networks.conf
#   sudo /home/hb/Panel2Net/.venv/bin/python3 setup_network.py --dry-run
#   sudo /home/hb/Panel2Net/.venv/bin/python3 setup_network.py

JN-iPhone|100|replace-me|no
10001|90|replace-me|yes
Y800Z_DA89|80|replace-me|no
NLan|50|replace-me|no
```

- [ ] **Step 6: Add the real config to `.gitignore`**

Append to `.gitignore`, next to the existing `apps/pi/research/` entry:

```
apps/pi/networks.conf
```

- [ ] **Step 7: Verify the dry run on the checkout, then commit**

```bash
cd apps/pi
cp networks.conf.example /tmp/networks.test.conf
python3 setup_network.py --conf /tmp/networks.test.conf --dry-run
```

Expected: four pairs of `nmcli con add` / `nmcli con mod` lines with `<psk>` in place of `replace-me`, then the `10-dragons.conf` body. Confirm no `replace-me` appears in the output:

```bash
python3 setup_network.py --conf /tmp/networks.test.conf --dry-run | grep -c replace-me
```

Expected: `0`

```bash
cd ../..
git add apps/pi/setup_network.py apps/pi/networks.conf.example apps/pi/tests/test_setup_network.py .gitignore
git commit -m "feat(pi): provision wifi profiles from a priority-ordered network list"
```

---

### Task 2: Watchdog decision ladder

**Files:**
- Create: `apps/pi/net_policy.py`
- Create: `apps/pi/tests/test_net_policy.py`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - Action names `RESCAN`, `DEMOTE`, `RADIO_CYCLE`, `RESTART_NM` (all `str`)
  - Thresholds `RESCAN_AT = 3`, `DEMOTE_EVERY = 5`, `RADIO_CYCLE_EVERY = 10`, `RESTART_NM_EVERY = 20`, `PENALTY_SECONDS = 600`
  - `class Decision` with `next_failures: int`, `actions: list[str]`, `demote_ssid: str | None`, `unpenalise: list[str]`, `reason: str`
  - `expired_penalties(penalties: dict[str, float], now: float) -> list[str]`
  - `decide(previous_failures: int, internet_ok: bool, api_ok: bool, current_ssid: str | None, penalties: dict[str, float], now: float) -> Decision`

- [ ] **Step 1: Write the failing tests**

Create `apps/pi/tests/test_net_policy.py`:

```python
"""Tests for the connectivity watchdog's decision ladder.

The ladder is pure, so every rung is asserted directly instead of being inferred
from a Pi's behaviour. The clock is passed in, so penalty expiry is tested
without waiting ten minutes.
"""

import pytest

import net_policy

NOW = 1_000_000.0


def offline(previous_failures, current_ssid='Gym', penalties=None, now=NOW):
    return net_policy.decide(previous_failures, False, False, current_ssid,
                             penalties if penalties is not None else {}, now)


def test_online_resets_the_counter_and_does_nothing():
    decision = net_policy.decide(7, True, True, 'Gym', {}, NOW)
    assert decision.next_failures == 0
    assert decision.actions == []
    assert decision.demote_ssid is None


def test_internet_up_but_api_down_is_not_treated_as_a_wifi_fault():
    decision = net_policy.decide(7, True, False, 'Gym', {}, NOW)
    assert decision.next_failures == 0
    assert decision.actions == []
    assert 'API' in decision.reason


@pytest.mark.parametrize('previous', [0, 1])
def test_the_first_two_failures_only_count(previous):
    decision = offline(previous)
    assert decision.next_failures == previous + 1
    assert decision.actions == []


@pytest.mark.parametrize('previous', [2, 3])
def test_a_rescan_starts_at_three_failures(previous):
    decision = offline(previous)
    assert decision.actions == [net_policy.RESCAN]


def test_five_failures_demote_the_current_network():
    decision = offline(4)
    assert decision.next_failures == 5
    assert decision.actions == [net_policy.RESCAN, net_policy.DEMOTE]
    assert decision.demote_ssid == 'Gym'


def test_ten_failures_cycle_the_radio_and_do_not_also_demote():
    decision = offline(9)
    assert decision.actions == [net_policy.RESCAN, net_policy.RADIO_CYCLE]
    assert decision.demote_ssid is None


def test_twenty_failures_restart_networkmanager():
    decision = offline(19)
    assert decision.actions == [net_policy.RESCAN, net_policy.RESTART_NM]


@pytest.mark.parametrize('previous, expected', [
    (14, net_policy.DEMOTE),        # 15
    (24, net_policy.DEMOTE),        # 25
    (29, net_policy.RADIO_CYCLE),   # 30
    (39, net_policy.RESTART_NM),    # 40
])
def test_the_ladder_repeats_with_one_action_per_rung(previous, expected):
    decision = offline(previous)
    assert decision.actions == [net_policy.RESCAN, expected]


@pytest.mark.parametrize('previous', [5, 6, 7])
def test_failures_between_rungs_only_rescan(previous):
    decision = offline(previous)
    assert decision.actions == [net_policy.RESCAN]


def test_nothing_is_demoted_when_no_profile_is_active():
    decision = offline(4, current_ssid=None)
    assert decision.actions == [net_policy.RESCAN]
    assert decision.demote_ssid is None


def test_an_already_penalised_network_is_not_demoted_again():
    decision = offline(4, penalties={'Gym': NOW - 10})
    assert decision.actions == [net_policy.RESCAN]
    assert decision.demote_ssid is None


def test_an_expired_penalty_is_lifted():
    decision = offline(1, penalties={'Gym': NOW - net_policy.PENALTY_SECONDS})
    assert decision.unpenalise == ['Gym']


def test_a_fresh_penalty_is_left_alone():
    decision = offline(1, penalties={'Gym': NOW - 1})
    assert decision.unpenalise == []


def test_going_online_does_not_lift_an_unexpired_penalty():
    # Re-admitting a network the Pi just proved broken would flap straight back
    # to it if it outranked the one that works. Penalties expire on their timer.
    decision = net_policy.decide(9, True, True, 'JN-iPhone', {'Gym': NOW - 5}, NOW)
    assert decision.unpenalise == []
    assert decision.next_failures == 0


def test_expired_penalties_are_sorted_for_a_stable_log_line():
    penalties = {'Zulu': NOW - 700, 'Alpha': NOW - 700}
    assert net_policy.expired_penalties(penalties, NOW) == ['Alpha', 'Zulu']
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/pi && pytest tests/test_net_policy.py -v`
Expected: collection error, `ModuleNotFoundError: No module named 'net_policy'`

- [ ] **Step 3: Write `apps/pi/net_policy.py`**

```python
# Pure decision logic for the connectivity watchdog.
#
# Everything between "here is what the probes said and what happened last time"
# and "here is the list of actions to run" lives here, with no subprocess, no
# socket and no clock, so it can be exercised by tests. net_watchdog.py keeps the
# probes, the nmcli calls, the state file and the logging.
#
# The ladder and the reasoning behind each rung are recorded in
# docs/superpowers/specs/2026-07-30-pi-multi-network-wifi-design.md.

RESCAN = 'rescan'
DEMOTE = 'demote'
RADIO_CYCLE = 'radio_cycle'
RESTART_NM = 'restart_nm'

# Consecutive failed internet probes before each rung. Probes run once a minute,
# so these are roughly minutes offline. Past the last rung the ladder repeats on
# multiples, so a Pi that stays offline keeps trying rather than going quiet.
RESCAN_AT = 3
DEMOTE_EVERY = 5
RADIO_CYCLE_EVERY = 10
RESTART_NM_EVERY = 20

# How long a demoted SSID stays out of the running.
PENALTY_SECONDS = 600


class Decision:
    """What the watchdog should do about one round of probes.

    next_failures  consecutive-internet-failure count to persist
    actions        ordered action names to execute
    demote_ssid    SSID to demote when DEMOTE is in actions, otherwise None
    unpenalise     SSIDs whose penalty has expired and may autoconnect again
    reason         one line for the log
    """

    __slots__ = ('next_failures', 'actions', 'demote_ssid', 'unpenalise', 'reason')

    def __init__(self, next_failures, actions, demote_ssid, unpenalise, reason):
        self.next_failures = next_failures
        self.actions = actions
        self.demote_ssid = demote_ssid
        self.unpenalise = unpenalise
        self.reason = reason

    def __repr__(self):
        return ('Decision(next_failures=%r, actions=%r, demote_ssid=%r, '
                'unpenalise=%r, reason=%r)'
                % (self.next_failures, self.actions, self.demote_ssid,
                   self.unpenalise, self.reason))


def expired_penalties(penalties, now):
    """SSIDs whose penalty has run its course, sorted for a stable log line."""
    return sorted(ssid for ssid, since in penalties.items()
                  if now - since >= PENALTY_SECONDS)


def _strongest(failures):
    """The single heaviest rung due at this failure count, or None.

    Checked heaviest-first so failure 20 restarts NetworkManager instead of
    doing three things at once.
    """
    if failures % RESTART_NM_EVERY == 0:
        return RESTART_NM
    if failures % RADIO_CYCLE_EVERY == 0:
        return RADIO_CYCLE
    if failures % DEMOTE_EVERY == 0:
        return DEMOTE
    return None


def decide(previous_failures, internet_ok, api_ok, current_ssid, penalties, now):
    """Decide what to do about one round of probes.

    The internet probe, not the API probe, drives the ladder. An API outage with
    a working uplink is somebody else's problem, and acting on it would cycle the
    radio through every deployment and every backend incident, mid-game
    included.
    """
    unpenalise = expired_penalties(penalties, now)

    if internet_ok:
        reason = ('online' if api_ok
                  else 'internet up, API unreachable - not a wifi fault')
        return Decision(0, [], None, unpenalise, reason)

    failures = previous_failures + 1
    actions = []
    if failures >= RESCAN_AT:
        # Cheap, and it is what catches a phone hotspot the moment it appears.
        actions.append(RESCAN)

    demote_ssid = None
    strongest = _strongest(failures)
    if strongest == DEMOTE:
        # Demoting needs something to demote that is not already out of the
        # running; otherwise hold at the rescan and let the next rung escalate.
        if current_ssid and current_ssid not in penalties:
            demote_ssid = current_ssid
            actions.append(DEMOTE)
    elif strongest is not None:
        actions.append(strongest)

    return Decision(failures, actions, demote_ssid, unpenalise,
                    'offline for %d probe(s)' % failures)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/pi && pytest tests/test_net_policy.py -v`
Expected: PASS, 22 tests (11 of them from the four parametrised cases)

- [ ] **Step 5: Commit**

```bash
git add apps/pi/net_policy.py apps/pi/tests/test_net_policy.py
git commit -m "feat(pi): add the connectivity watchdog decision ladder"
```

---

### Task 3: Watchdog runner and systemd units

**Files:**
- Create: `apps/pi/net_watchdog.py`
- Create: `apps/pi/net-watchdog.service`
- Create: `apps/pi/net-watchdog.timer`

**Interfaces:**
- Consumes: `net_policy.decide`, `net_policy.Decision`, the four action names, `net_policy.PENALTY_SECONDS`.
- Produces: `main(argv=None) -> int`; env overrides `WATCHDOG_STATE`, `WATCHDOG_INTERNET_URL`, `WATCHDOG_API_URL`, `WATCHDOG_WIFI_DEVICE`.

This task has no unit tests of its own. Every branch worth asserting lives in `net_policy`; what remains is `subprocess` and `urllib` plumbing whose only meaningful test is the on-device verification in Task 5. Do not add mock-heavy tests for it — the repo's `Panel2Net.py` I/O layer is untested for the same reason, and its logic sits in the tested `panel_pipeline.py`.

- [ ] **Step 1: Write `apps/pi/net_watchdog.py`**

```python
#!/usr/bin/env python3
# Connectivity watchdog for the scoreboard Pi.
#
# Runs once per invocation from net-watchdog.timer, probes the uplink and hands
# the result to net_policy.decide. Everything with a side effect lives here: the
# HTTP probes, the nmcli and systemctl calls, the state file, the logging. The
# ladder itself is in net_policy.py and is covered by tests.
#
# Runs as root: nmcli con mod and systemctl restart both need it.

import argparse
import json
import logging
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

import net_policy

STATE_PATH = os.environ.get('WATCHDOG_STATE',
                            '/var/lib/panel2net/net-watchdog.json')
# A 204 endpoint, so a captive portal's redirect reads as a failure rather than
# as a working uplink.
INTERNET_URL = os.environ.get('WATCHDOG_INTERNET_URL',
                              'http://connectivity-check.gstatic.com/generate_204')
API_URL = os.environ.get('WATCHDOG_API_URL', 'https://api.app.hbdragons.de/health')
WIFI_DEVICE = os.environ.get('WATCHDOG_WIFI_DEVICE', 'wlan0')
PROBE_TIMEOUT = 8
COMMAND_TIMEOUT = 60
RADIO_CYCLE_PAUSE = 5

log = logging.getLogger('net-watchdog')


def read_state(path):
    """Previous failure count and penalties, forgiving about a missing or
    corrupt file — a watchdog that cannot start is worse than one that restarts
    its counters."""
    try:
        with open(path) as handle:
            state = json.load(handle)
    except (OSError, ValueError):
        return 0, {}
    if not isinstance(state, dict):
        return 0, {}
    failures = state.get('failures', 0)
    penalties = state.get('penalties', {})
    if not isinstance(failures, int) or failures < 0:
        failures = 0
    if not isinstance(penalties, dict):
        penalties = {}
    return failures, penalties


def write_state(path, failures, penalties):
    """Write the state file atomically, so a power cut cannot leave half of one."""
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w') as handle:
        json.dump({'failures': failures, 'penalties': penalties}, handle)
    os.replace(tmp, path)


def probe(url, method='GET'):
    """True when the URL answers with a non-error status inside the timeout."""
    request = urllib.request.Request(url, method=method)
    try:
        with urllib.request.urlopen(request, timeout=PROBE_TIMEOUT) as reply:
            return 200 <= reply.status < 400
    except (urllib.error.URLError, OSError, ValueError) as exc:
        log.debug('probe %s failed: %s', url, exc)
        return False


def run(argv, dry_run):
    """Run one command, logging it either way. Never raises."""
    printable = ' '.join(argv)
    if dry_run:
        log.info('would run: %s', printable)
        return True
    try:
        completed = subprocess.run(argv, capture_output=True, text=True,
                                   timeout=COMMAND_TIMEOUT)
    except (OSError, subprocess.SubprocessError) as exc:
        log.warning('%s did not run: %s', printable, exc)
        return False
    if completed.returncode != 0:
        log.warning('%s exited %d: %s', printable, completed.returncode,
                    completed.stderr.strip())
        return False
    log.info('ran: %s', printable)
    return True


def _nmcli_lines(argv):
    try:
        completed = subprocess.run(argv, capture_output=True, text=True,
                                   timeout=20, check=False)
    except (OSError, subprocess.SubprocessError) as exc:
        log.warning('%s did not run: %s', ' '.join(argv), exc)
        return []
    return [line for line in completed.stdout.splitlines() if line.strip()]


def active_wifi_profile(device):
    """The NetworkManager connection id currently up on the wifi device."""
    for line in _nmcli_lines(['nmcli', '-t', '-f', 'NAME,DEVICE',
                              'con', 'show', '--active']):
        name, _, active_device = line.rpartition(':')
        if active_device == device:
            return name
    return None


def log_visible_ssids():
    """Record what the radio can see, so the journal explains a failed switch."""
    seen = _nmcli_lines(['nmcli', '-t', '-f', 'SSID,SIGNAL', 'dev', 'wifi',
                         'list', '--rescan', 'no'])
    log.info('visible networks: %s', ', '.join(seen) if seen else 'none')


def apply(decision, dry_run):
    """Execute a Decision."""
    for ssid in decision.unpenalise:
        log.info('penalty expired for %s, allowing autoconnect again', ssid)
        run(['nmcli', 'con', 'mod', ssid, 'connection.autoconnect', 'yes'], dry_run)

    for action in decision.actions:
        if action == net_policy.RESCAN:
            run(['nmcli', 'dev', 'wifi', 'rescan'], dry_run)
            if not dry_run:
                log_visible_ssids()
        elif action == net_policy.DEMOTE:
            ssid = decision.demote_ssid
            log.warning('demoting %s for %d s and re-running autoconnect',
                        ssid, net_policy.PENALTY_SECONDS)
            run(['nmcli', 'con', 'mod', ssid, 'connection.autoconnect', 'no'], dry_run)
            run(['nmcli', 'con', 'down', ssid], dry_run)
            run(['nmcli', 'dev', 'connect', WIFI_DEVICE], dry_run)
        elif action == net_policy.RADIO_CYCLE:
            log.warning('cycling the wifi radio')
            run(['nmcli', 'radio', 'wifi', 'off'], dry_run)
            if not dry_run:
                time.sleep(RADIO_CYCLE_PAUSE)
            run(['nmcli', 'radio', 'wifi', 'on'], dry_run)
        elif action == net_policy.RESTART_NM:
            log.warning('restarting NetworkManager')
            run(['systemctl', 'restart', 'NetworkManager'], dry_run)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description='Probe the uplink and recover the wifi when it is down.')
    parser.add_argument('--dry-run', action='store_true',
                        help='log what would run, touch nothing, leave the state file alone')
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s',
                        stream=sys.stderr)

    failures, penalties = read_state(STATE_PATH)
    internet_ok = probe(INTERNET_URL, method='HEAD')
    # Only worth asking when there is an uplink to ask over.
    api_ok = probe(API_URL) if internet_ok else False
    current = active_wifi_profile(WIFI_DEVICE)

    now = time.time()
    decision = net_policy.decide(failures, internet_ok, api_ok, current,
                                 penalties, now)
    log.info('%s (profile=%s)', decision.reason, current or 'none')
    apply(decision, args.dry_run)

    if args.dry_run:
        return 0

    for ssid in decision.unpenalise:
        penalties.pop(ssid, None)
    if decision.demote_ssid:
        penalties[decision.demote_ssid] = now
    write_state(STATE_PATH, decision.next_failures, penalties)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
```

- [ ] **Step 2: Write `apps/pi/net-watchdog.service`**

`StateDirectory=panel2net` makes systemd create `/var/lib/panel2net` with the right ownership, which is where `STATE_PATH` points.

```ini
[Unit]
Description=Panel2Net connectivity watchdog
After=NetworkManager.service
Wants=NetworkManager.service

[Service]
Type=oneshot
StateDirectory=panel2net
WorkingDirectory=/home/hb/Panel2Net
ExecStart=/home/hb/Panel2Net/.venv/bin/python3 /home/hb/Panel2Net/net_watchdog.py
```

- [ ] **Step 3: Write `apps/pi/net-watchdog.timer`**

A monotonic timer, so there is no `Persistent=` (that only applies to calendar timers). `OnBootSec` gives NetworkManager time to bring up a profile before the first probe counts against it.

```ini
[Unit]
Description=Run the Panel2Net connectivity watchdog every minute

[Timer]
Unit=net-watchdog.service
OnBootSec=2min
OnUnitActiveSec=60s
AccuracySec=5s

[Install]
WantedBy=timers.target
```

- [ ] **Step 4: Check the module imports and the dry run locally**

Run from `apps/pi` on the dev machine. The probes will succeed here, so the expected outcome is the "online" path and an untouched state file:

```bash
cd apps/pi
WATCHDOG_STATE=/tmp/watchdog-test.json python3 net_watchdog.py --dry-run
```

Expected: an `INFO online (profile=None)` line, no `would run:` lines, and no
`/tmp/watchdog-test.json` created (`--dry-run` skips the write). A dev machine
has no `nmcli`, so a `WARNING ... did not run: [Errno 2]` line before it is
correct — `active_wifi_profile` degrades to `None` rather than raising.

Force the offline path with a URL that cannot resolve, to see the ladder engage:

```bash
WATCHDOG_STATE=/tmp/watchdog-test.json \
WATCHDOG_INTERNET_URL=http://127.0.0.1:1/generate_204 \
python3 net_watchdog.py --dry-run
```

Expected: `INFO offline for 1 probe(s)`, no actions yet.

- [ ] **Step 5: Confirm the whole suite still passes**

Run: `cd apps/pi && pytest -v`
Expected: PASS — the new tests plus the existing `test_panel_pipeline.py`

- [ ] **Step 6: Commit**

```bash
git add apps/pi/net_watchdog.py apps/pi/net-watchdog.service apps/pi/net-watchdog.timer
git commit -m "feat(pi): add the connectivity watchdog runner and its timer"
```

---

### Task 4: README correction and documentation

**Files:**
- Modify: `apps/pi/README.md`

The current install section is wrong about the box in three ways: the path is `/home/hb/Panel2Net` not `/home/pi/Panel2Net`, dependencies live in a venv at `.venv/bin/python3` rather than a `sudo pip3 install`, and `panel2net.service` runs `User=hb`. Correct those in the same pass as adding the new sections, so the file describes one coherent machine.

- [ ] **Step 1: Replace the Install section**

Replace the whole fenced block under `## Install` with:

````markdown
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
````

- [ ] **Step 2: Add the network sections after Install**

Insert before `## Layout`:

````markdown
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

On consecutive internet failures: 3 rescans, 5 demotes the current network for
10 minutes and lets NetworkManager pick the next priority, 10 cycles the radio,
20 restarts NetworkManager. Past that the ladder repeats. It never reboots. The
demotion rung is what recovers from a venue wifi with a captive portal, where
the Pi holds a lease but has no usable uplink.

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
````

- [ ] **Step 3: Verify the prose passes the slop check**

Run: `node scripts/check-ai-slop.mjs`
Expected: `AI slop check passed.`

- [ ] **Step 4: Commit**

```bash
git add apps/pi/README.md
git commit -m "docs(pi): correct the install paths and document wifi, watchdog and access"
```

---

### Task 5: On-device cutover

**Files:** none in the repo. This task changes the Pi.

Every step runs over `ssh dragonstail`, never `ssh dragonspi` — the profile being
replaced is the one carrying the LAN session. Do not proceed if `ssh dragonstail`
fails.

- [ ] **Step 1: Confirm out-of-band access**

```bash
ssh dragonstail 'hostname; tailscale ip -4'
```

Expected: `dragonspi` and `100.125.219.119`.

- [ ] **Step 2: Copy the new files to the Pi**

```bash
cd apps/pi
scp net_policy.py net_watchdog.py setup_network.py networks.conf.example dragonstail:/tmp/
scp net-watchdog.service net-watchdog.timer dragonstail:/tmp/
ssh dragonstail 'sudo install -o hb -g hb -m 0644 /tmp/net_policy.py /tmp/net_watchdog.py /tmp/setup_network.py /home/hb/Panel2Net/'
```

- [ ] **Step 3: Write `networks.conf` with the real keys**

The four SSIDs already on the box are `NLan` (home, currently active), `10001`
(hidden), `Y800Z_DA89`, plus the iPhone hotspot to add. Existing PSKs can be read
from the keyfiles:

```bash
ssh dragonstail 'sudo grep -h psk= /etc/NetworkManager/system-connections/*.nmconnection'
ssh dragonstail 'sudo grep -A2 -i password /etc/netplan/90-NM-4ef6401e-e687-3161-9ee6-3f5921670e56.yaml'
```

Then create the file with mode `0600` and fill in the keys:

```bash
ssh dragonstail 'sudo install -m 0600 /dev/null /home/hb/Panel2Net/networks.conf'
ssh -t dragonstail 'sudo nano /home/hb/Panel2Net/networks.conf'
```

- [ ] **Step 4: Dry run, read the output, then apply**

```bash
ssh dragonstail 'cd /home/hb/Panel2Net && sudo .venv/bin/python3 setup_network.py --dry-run'
```

Expected: `nmcli con mod` for the three profiles that exist, `con add` plus
`con mod` for the iPhone hotspot, `<psk>` everywhere a key would be, and the
`10-dragons.conf` body. Confirm no real key is echoed. Then:

```bash
ssh dragonstail 'cd /home/hb/Panel2Net && sudo .venv/bin/python3 setup_network.py'
ssh dragonstail 'nmcli -t -f NAME,AUTOCONNECT,AUTOCONNECT-PRIORITY con show'
```

Expected: each wifi profile reporting the priority from the file, no longer `0`.

- [ ] **Step 5: Confirm power-save is off and the link is quicker**

```bash
ssh dragonstail 'sudo cat /etc/NetworkManager/conf.d/10-dragons.conf'
/Applications/Tailscale.app/Contents/MacOS/Tailscale ping --c 3 dragonspi
```

Expected: the round trip well below the 99 ms measured before the change. If it
has not moved, the setting needs NetworkManager restarted or the profile
reactivated:

```bash
ssh dragonstail 'sudo systemctl restart NetworkManager'
```

- [ ] **Step 6: Migrate `NLan` off netplan, then reboot-test**

The new keyfile profile and the netplan-generated one both target `NLan`. Confirm
the keyfile one is what activates, then remove the netplan source so it stops
being regenerated at boot. Keep the `eth0` netplan file — `eth0` is unused and it
does no harm.

```bash
ssh dragonstail 'nmcli -t -f NAME,DEVICE con show --active'
ssh dragonstail 'sudo rm /etc/netplan/90-NM-4ef6401e-e687-3161-9ee6-3f5921670e56.yaml'
ssh dragonstail 'sudo reboot'
```

After it comes back (wait ~60 s):

```bash
ssh dragonstail 'nmcli -t -f NAME,DEVICE con show --active; ls /run/NetworkManager/system-connections/'
```

Expected: `NLan` active on `wlan0`, and no `netplan-wlan0-NLan.nmconnection` in
`/run`. Also confirm the priorities survived:

```bash
ssh dragonstail 'nmcli -t -f NAME,AUTOCONNECT-PRIORITY con show'
```

- [ ] **Step 7: Install the watchdog and exercise the ladder**

```bash
ssh dragonstail 'sudo cp /tmp/net-watchdog.service /tmp/net-watchdog.timer /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now net-watchdog.timer'
ssh dragonstail 'sudo systemctl start net-watchdog.service && journalctl -u net-watchdog.service -n 20 --no-pager'
```

Expected: `INFO online (profile=NLan)`.

Now prove the offline path without breaking the real uplink, by pointing the
internet probe at a dead port and running it by hand five times. Use a scratch
state file so the real counter is untouched:

```bash
ssh dragonstail 'cd /home/hb/Panel2Net && for i in 1 2 3 4 5; do sudo WATCHDOG_STATE=/tmp/wd.json WATCHDOG_INTERNET_URL=http://127.0.0.1:1/generate_204 .venv/bin/python3 net_watchdog.py --dry-run; done'
```

Expected: `--dry-run` leaves the counter at 1 every time, so this confirms the
probe fails and the wiring works but not the escalation. To see the rungs, seed
the counter directly and run once per rung:

```bash
ssh dragonstail 'cd /home/hb/Panel2Net && for n in 2 4 9 19; do echo "{\"failures\": $n, \"penalties\": {}}" | sudo tee /tmp/wd.json >/dev/null; sudo WATCHDOG_STATE=/tmp/wd.json WATCHDOG_INTERNET_URL=http://127.0.0.1:1/generate_204 .venv/bin/python3 net_watchdog.py --dry-run; done'
ssh dragonstail 'sudo rm -f /tmp/wd.json'
```

Expected, in order: `would run: nmcli dev wifi rescan`; then rescan plus
`demoting NLan`; then rescan plus `cycling the wifi radio`; then rescan plus
`restarting NetworkManager`. Nothing is actually executed under `--dry-run`.

- [ ] **Step 8: Confirm the timer is running and the ingest service is unharmed**

```bash
ssh dragonstail 'systemctl list-timers net-watchdog.timer --no-pager; systemctl is-active panel2net.service; sudo cat /var/lib/panel2net/net-watchdog.json'
```

Expected: the timer scheduled ~60 s out, `panel2net.service` still `active`, and
a state file reading `{"failures": 0, "penalties": {}}`.

- [ ] **Step 9: Real-world check with a phone hotspot**

Switch on the iPhone hotspot and watch the Pi move to it, since it outranks
`NLan`:

```bash
ssh dragonstail 'journalctl -u net-watchdog.service -f'
```

Then in another shell, after the hotspot has been up a minute:

```bash
ssh dragonstail 'nmcli -t -f NAME,DEVICE con show --active'
```

Expected: the hotspot profile active on `wlan0`, and `ssh dragonstail` still
working while `ssh dragonspi` no longer does. Switch the hotspot off and confirm
it returns to `NLan`.

---

## Verification

Run before opening a PR:

```bash
cd apps/pi && pytest -v
node ../../scripts/check-ai-slop.mjs
node ../../scripts/check-skipped-tests.mjs
```

`pnpm lint` and `pnpm typecheck` do not cover `apps/pi` (it is not a pnpm
workspace package), so the pytest job is the gate that matters here.
