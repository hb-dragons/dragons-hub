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


def next_profile(profiles, penalties, leaving):
    """The profile to activate after demoting one, or None if there is none.

    The watchdog has to name its replacement. `nmcli device connect` picks a
    profile itself, but it deliberately considers connections that are not set
    to autoconnect, so it re-selects the profile just demoted and the rung
    becomes a no-op — which is exactly what the first on-device run did.

    profiles is an iterable of (name, priority). Ties break by name so the same
    inventory always yields the same choice.
    """
    ranked = sorted(
        (name, priority) for name, priority in profiles
        if name != leaving and name not in penalties
    )
    if not ranked:
        return None
    return max(ranked, key=lambda entry: entry[1])[0]


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
