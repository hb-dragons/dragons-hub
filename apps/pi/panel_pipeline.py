# Pure transformation pipeline for Panel2Net.
#
# Everything between "bytes came off the serial port" and "this is the body and
# these are the headers of the POST" lives here, with no serial port, no socket
# and no globals, so it can be exercised by tests. Panel2Net.py keeps the I/O
# loop, the retry/baudrate handling and the logging.
#
# Frame layouts are documented in STRAMATEL-PROTOCOL.md.

import binascii

# Panel signatures, expressed in the uppercase ASCII-hex domain the classifier
# works in (two characters per serial byte).
MOBATIME_START = b'017F0247'
MOBATIME_END = b'03'
STRAMATEL_START_A = b'F83320'
STRAMATEL_START_B = b'E8E8E4'
STRAMATEL_END = b'0D'
SEGMENT_START = b'00F8E1'
SEGMENT_END = b'E5'
SWISSTIMING_START_A = b'0254'
SWISSTIMING_START_B = b'0244'
SWISSTIMING_END = b'03'

# Serial reads are this many bytes at a time in the Panel2Net loop.
READ_SIZE = 128


class FrameResult:
    """Outcome of classifying one serial read.

    panel          name of the recognised panel, or None when nothing matched
    body           the POST body, b'' when there is nothing to send
    remainder_hex  hex text carried over to the front of the next read
    should_post    whether this frame is ours to forward to the API
    """

    __slots__ = ('panel', 'body', 'remainder_hex', 'should_post')

    def __init__(self, panel, body, remainder_hex, should_post):
        self.panel = panel
        self.body = body
        self.remainder_hex = remainder_hex
        self.should_post = should_post

    def __repr__(self):
        return ('FrameResult(panel=%r, body=%r, remainder_hex=%r, should_post=%r)'
                % (self.panel, self.body, self.remainder_hex, self.should_post))


def to_hex(response):
    """Normalise one serial read to uppercase ASCII hex text.

    Panels that already speak ASCII hex are passed through untouched; binary
    panels (the Stramatel 452 M among them) are hexlified.

    Nothing is filtered out of the read on the way in. This used to strip ASCII
    spaces from the bytes first, to tidy up hex text of the form "F8 33 20" —
    but on a binary panel that deletes every 0x20 byte, and 0x20 is the third
    byte of the SC24 frame signature C3 00 20 F6 that the API's segment decoder
    keys on. Do not reintroduce it: whatever the panel sent has to reach the
    hexlify call intact.
    """
    try:
        int(response, 16)
    except ValueError:
        # not hex, needs conversion
        return binascii.hexlify(response).upper()
    return response


def classify(response, remainder_hex=b''):
    """Turn one serial read plus the previous read's remainder into a FrameResult.

    Splits the hex stream at the panel's start/end tokens, keeps the trailing
    partial frame as the next remainder, and reports whether the extracted frame
    is one we forward.
    """
    response_hex = remainder_hex + to_hex(response)

    if (response_hex.find(MOBATIME_START) != -1) and (response_hex.rfind(MOBATIME_END) != -1):
        # Mobatime panel data — recognised so the reader does not thrash the
        # baudrate, but not forwarded.
        start = response_hex.find(MOBATIME_START)
        end = response_hex.rfind(MOBATIME_END)
        # End + 4 because after the end token there is a checksum byte
        return FrameResult(
            'mobatime',
            response_hex[start:end + 4] + MOBATIME_START,
            response_hex[end + 4:],
            False,
        )

    if ((response_hex.find(STRAMATEL_START_A) != -1)
            or (response_hex.find(STRAMATEL_START_B) != -1)) \
            and (response_hex.rfind(STRAMATEL_END) != -1):
        # Legacy Stramatel F8 33 framing — ours to forward.
        start = max(response_hex.find(STRAMATEL_START_A), response_hex.find(STRAMATEL_START_B))
        end = response_hex.rfind(STRAMATEL_END)
        # End + 2 because after the end token there is no checksum byte
        # Forward the hex text, like the segment branch: the API route does
        # Buffer.from(hex, "hex"), which silently truncates raw bytes at the
        # first non-hex character instead of failing.
        return FrameResult(
            'stramatel',
            response_hex[start:end + 2] + STRAMATEL_START_A,
            response_hex[end + 2:],
            True,
        )

    if (response_hex.find(SEGMENT_START) != -1) and (response_hex.rfind(SEGMENT_END) != -1):
        # Stramatel 452 M segment protocol — ours to forward.
        # Sync on the 3-byte '00 F8 E1'. The 4th marker byte was 'C3' until the
        # SC24 shot-clock module was connected; it now inserts a variable-length
        # prefix between E1 and C3, so the contiguous '00F8E1C3' no longer
        # appears. The 3-byte sync matches both the original framing and the
        # SC24-era framing; the API decoder finds C3 and decodes relative to the
        # possession byte either way.
        start = response_hex.find(SEGMENT_START)
        end = response_hex.rfind(SEGMENT_END)
        # End + 2: the 'E5' terminator is two hex chars, no checksum follows
        return FrameResult(
            'stramatel-segment',
            response_hex[start:end + 2],
            response_hex[end + 2:],
            True,
        )

    if ((response_hex.find(SWISSTIMING_START_A) != -1)
            or (response_hex.find(SWISSTIMING_START_B) != -1)) \
            and (response_hex.rfind(SWISSTIMING_END) != -1):
        # SwissTiming panel data — recognised but not forwarded.
        start = max(response_hex.find(SWISSTIMING_START_A), response_hex.find(SWISSTIMING_START_B))
        end = response_hex.rfind(SWISSTIMING_END)
        # End + 4 because after the end token there is a checksum byte
        return FrameResult(
            'swisstiming',
            response_hex[start:end + 4] + SWISSTIMING_START_A,
            response_hex[end + 4:],
            False,
        )

    # Nothing recognised: the caller retries and then walks the baudrate. Drop
    # the remainder so a half-decoded stream cannot poison the next read.
    return FrameResult(None, b'', b'', False)


def replay(data, chunk_size=READ_SIZE):
    """Yield the POST body of every frame a stream of serial bytes would send.

    Mirrors the Panel2Net read loop: fixed-size reads, remainder carried into
    the next read, bodies emitted only for panels we forward. Used by the tests
    and by scripts/replay-pipeline.py to put the real transformation in front of
    the API decoder.
    """
    remainder_hex = b''
    for offset in range(0, len(data), chunk_size):
        frame = classify(data[offset:offset + chunk_size], remainder_hex)
        remainder_hex = frame.remainder_hex
        if frame.should_post and frame.body != b'':
            yield frame.body


def build_headers(device_id, scoreboard_key):
    """Headers for one ingest POST.

    Exactly one Content-Type. http.client sends every key of this dict as its
    own header line, so a second spelling ('Content-type') put two Content-Type
    lines on the wire — tolerated by Hono, but an HTTP front end is entitled to
    reject the request.
    """
    return {
        'Content-Type': 'text/plain',
        'Accept': 'text/plain',
        'Connection': 'keep-alive',
        'Device_ID': device_id,
        'Authorization': 'Bearer ' + scoreboard_key,
    }
