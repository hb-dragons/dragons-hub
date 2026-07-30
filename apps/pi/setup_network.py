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
