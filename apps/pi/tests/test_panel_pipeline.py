"""Tests for the Panel2Net transformation pipeline.

The fixture is a live capture from the Stramatel 452 M with the SC24 shot-clock
module connected — the hardware currently in the hall. It is shared with the
API's decoder tests, so both sides of the wire are exercised against the same
bytes.
"""

import binascii
import os

import pytest

import panel_pipeline

FIXTURE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    'api', 'src', 'services', 'scoreboard', '__fixtures__',
    'segment-sc24-connected.bin',
)

# Every SC24 main scoreboard block starts with this signature. 0x20 is its third
# byte, which is what made stripping ASCII spaces from the raw serial bytes
# destroy the whole stream.
SC24_SIGNATURE = bytes.fromhex('c30020f6')

HEX_ALPHABET = set(b'0123456789ABCDEF')


@pytest.fixture(scope='module')
def capture():
    with open(FIXTURE, 'rb') as f:
        return f.read()


def test_fixture_is_the_expected_capture(capture):
    assert len(capture) == 5553
    # Every 0x20 in the capture is the third byte of the frame signature.
    assert capture.count(b' ') == 68
    assert capture.count(SC24_SIGNATURE) == 68


def test_to_hex_preserves_space_bytes():
    raw = bytes.fromhex('00f8e1c30020f6fb')
    assert panel_pipeline.to_hex(raw) == b'00F8E1C30020F6FB'


def test_to_hex_passes_ascii_hex_panels_through():
    assert panel_pipeline.to_hex(b'F83320') == b'F83320'


def test_replay_forwards_every_frame_with_its_signature_intact(capture):
    bodies = list(panel_pipeline.replay(capture))

    assert len(bodies) == 44
    intact = [b for b in bodies if SC24_SIGNATURE in binascii.unhexlify(b)]
    assert len(intact) == 44


def test_replay_posts_hex_text_the_api_can_parse(capture):
    for body in panel_pipeline.replay(capture):
        assert set(body) <= HEX_ALPHABET
        assert len(body) % 2 == 0


def test_remainder_carries_a_split_frame_into_the_next_read():
    # A frame straddling a read boundary must survive: the tail of one read is
    # carried into the next rather than dropped.
    first = bytes.fromhex('00f8e1c30020f6fb') + b'\x9f' * 20 + b'\xe5'
    second = bytes.fromhex('00f8e1c30020f6fb') + b'\x9d' * 20 + b'\xe5'
    # The read boundary falls five bytes into the second frame, so its head
    # arrives on one read and its terminator on the next.
    bodies = list(panel_pipeline.replay(first + second, chunk_size=len(first) + 5))

    assert [binascii.unhexlify(b) for b in bodies] == [first, second]


def test_legacy_stramatel_branch_needs_a_terminator():
    # 'F83320' present, no '0D' anywhere in the hex text: rfind returns -1, and
    # -1 is truthy, so a bare `rfind(...)` guard let this through.
    result = panel_pipeline.classify(bytes.fromhex('f83320ffff'))
    assert result.panel is None
    assert result.should_post is False


def test_swisstiming_branch_needs_a_terminator():
    result = panel_pipeline.classify(bytes.fromhex('0254ffff'))
    assert result.panel is None


def test_legacy_stramatel_branch_posts_hex_not_raw_bytes():
    raw = bytes.fromhex('f833204142430d')
    result = panel_pipeline.classify(raw)

    assert result.panel == 'stramatel'
    assert result.should_post is True
    assert set(result.body) <= HEX_ALPHABET
    assert result.body.startswith(b'F83320')


def test_segment_branch_posts_the_frame_as_hex():
    raw = bytes.fromhex('00f8e1c30020f6fb') + b'\x9f' * 20 + b'\xe5'
    result = panel_pipeline.classify(raw)

    assert result.panel == 'stramatel-segment'
    assert result.should_post is True
    assert binascii.unhexlify(result.body) == raw


def test_unrecognised_panel_drops_the_remainder():
    result = panel_pipeline.classify(b'\x01\x02\x03\x04' * 8)
    assert result.panel is None
    assert result.should_post is False
    assert result.body == b''
    assert result.remainder_hex == b''


def test_headers_carry_exactly_one_content_type():
    headers = panel_pipeline.build_headers('dragons-1', 'secret')

    content_types = [k for k in headers if k.lower() == 'content-type']
    assert content_types == ['Content-Type']
    assert headers['Content-Type'] == 'text/plain'
    assert headers['Device_ID'] == 'dragons-1'
    assert headers['Authorization'] == 'Bearer secret'
