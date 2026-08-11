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
