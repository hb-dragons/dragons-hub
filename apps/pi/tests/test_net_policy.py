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
    assert net_policy.DEMOTE not in decision.actions
    assert decision.demote_ssid is None


def test_a_brief_gap_with_no_profile_is_not_acted_on():
    # wlan0 reads as "no profile" for a second or two while it comes back from a
    # radio cycle. Connecting then just logs failed activations against a device
    # that does not exist yet, which is what the first version did on the Pi.
    assert offline(0, current_ssid=None).actions == []
    assert offline(1, current_ssid=None).actions == []


def test_connecting_starts_at_the_rescan_threshold():
    decision = offline(2, current_ssid=None)
    assert decision.actions == [net_policy.RESCAN, net_policy.CONNECT]


def test_a_pi_holding_no_profile_still_escalates():
    decision = offline(9, current_ssid=None)
    assert decision.actions == [net_policy.RESCAN, net_policy.CONNECT,
                                net_policy.RADIO_CYCLE]


def test_an_associated_pi_is_not_told_to_connect():
    assert net_policy.CONNECT not in offline(4, current_ssid='Gym').actions


def test_an_online_pi_is_never_told_to_connect():
    decision = net_policy.decide(0, True, True, None, {}, NOW)
    assert decision.actions == []


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


def test_candidates_are_ranked_by_descending_priority():
    profiles = [('NLan', 50), ('10001', 100), ('Y800Z_DA89', 80)]
    assert net_policy.ranked_profiles(profiles, {}, None) == \
        ['10001', 'Y800Z_DA89', 'NLan']


def test_the_whole_list_is_returned_so_an_absent_network_can_be_skipped():
    # A higher-priority profile may simply not be in range. The watchdog works
    # down the list until one activates, so the list cannot stop at the head:
    # ranking by priority alone once left the Pi on no network at all.
    profiles = [('NLan', 50), ('10001', 100), ('Y800Z_DA89', 80)]
    assert net_policy.ranked_profiles(profiles, {}, '10001') == \
        ['Y800Z_DA89', 'NLan']


def test_the_profile_being_left_is_not_a_candidate():
    # nmcli dev connect would re-pick the demoted profile, because it considers
    # connections that are not set to autoconnect. The replacements are named
    # here instead of being left to NetworkManager.
    profiles = [('NLan', 50), ('10001', 100)]
    assert net_policy.ranked_profiles(profiles, {}, '10001') == ['NLan']


def test_a_penalised_profile_is_not_a_candidate():
    profiles = [('NLan', 50), ('10001', 100)]
    assert net_policy.ranked_profiles(profiles, {'10001': NOW}, None) == ['NLan']


def test_no_candidates_when_every_profile_is_out():
    assert net_policy.ranked_profiles([('NLan', 50)], {'NLan': NOW}, None) == []


def test_a_priority_tie_breaks_by_name():
    assert net_policy.ranked_profiles([('Zulu', 50), ('Alpha', 50)], {}, None) == \
        ['Alpha', 'Zulu']


def test_expired_penalties_are_sorted_for_a_stable_log_line():
    penalties = {'Zulu': NOW - 700, 'Alpha': NOW - 700}
    assert net_policy.expired_penalties(penalties, NOW) == ['Alpha', 'Zulu']
