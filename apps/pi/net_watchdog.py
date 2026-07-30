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
# 204 endpoints, so a captive portal's redirect reads as a failure rather than as
# a working uplink. Two of them, from different operators: the ladder tears down
# a working network on a false negative, and one venue blocking one hostname must
# not be enough to trigger that. WATCHDOG_INTERNET_URL replaces the whole list
# rather than adding to it, so pointing it at a dead port forces the offline path.
DEFAULT_INTERNET_URLS = (
    'http://connectivitycheck.gstatic.com/generate_204',
    'http://cp.cloudflare.com/generate_204',
)
_INTERNET_OVERRIDE = os.environ.get('WATCHDOG_INTERNET_URL')
INTERNET_URLS = (_INTERNET_OVERRIDE,) if _INTERNET_OVERRIDE else DEFAULT_INTERNET_URLS
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


def probe_internet():
    """True as soon as any of the connectivity endpoints answers."""
    for url in INTERNET_URLS:
        if probe(url, method='HEAD'):
            return True
    log.info('no connectivity endpoint answered: %s', ', '.join(INTERNET_URLS))
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


def wifi_profiles():
    """Saved wifi profiles as (connection id, autoconnect priority) pairs."""
    profiles = []
    for line in _nmcli_lines(['nmcli', '-t', '-f',
                              'NAME,TYPE,AUTOCONNECT-PRIORITY', 'con', 'show']):
        parts = line.rsplit(':', 2)
        if len(parts) != 3:
            continue
        name, kind, priority = parts
        if kind != '802-11-wireless':
            continue
        try:
            profiles.append((name, int(priority)))
        except ValueError:
            continue
    return profiles


def log_visible_ssids():
    """Record what the radio can see, so the journal explains a failed switch."""
    seen = _nmcli_lines(['nmcli', '-t', '-f', 'SSID,SIGNAL', 'dev', 'wifi',
                         'list', '--rescan', 'no'])
    log.info('visible networks: %s', ', '.join(seen) if seen else 'none')


def apply(decision, penalties, dry_run):
    """Execute a Decision. `penalties` is the state as it stood before this run."""
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
            # Name the replacement rather than letting nmcli choose: `dev
            # connect` considers profiles with autoconnect off and would come
            # straight back to the one just demoted.
            target = net_policy.next_profile(wifi_profiles(), penalties, ssid)
            if target:
                log.info('switching to %s', target)
                run(['nmcli', 'con', 'up', target], dry_run)
            else:
                log.warning('no other profile to switch to, letting NetworkManager retry')
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
    internet_ok = probe_internet()
    # Only worth asking when there is an uplink to ask over.
    api_ok = probe(API_URL) if internet_ok else False
    current = active_wifi_profile(WIFI_DEVICE)

    now = time.time()
    decision = net_policy.decide(failures, internet_ok, api_ok, current,
                                 penalties, now)
    log.info('%s (profile=%s)', decision.reason, current or 'none')
    apply(decision, penalties, args.dry_run)

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
