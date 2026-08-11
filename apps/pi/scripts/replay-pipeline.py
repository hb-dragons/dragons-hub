#!/usr/bin/env python3
"""Print the POST body of every frame the Pi would send for a captured stream.

    python3 apps/pi/scripts/replay-pipeline.py <capture.bin> [read-size]

One body per line, in order, exactly as panel_pipeline hands them to the HTTP
POST. Used by the API's pi-pipeline test to put the real Pi transformation in
front of the real decoder, and useful by hand when a capture misbehaves.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import panel_pipeline  # noqa: E402


def main(argv):
    if len(argv) < 2:
        sys.stderr.write(__doc__)
        return 2
    with open(argv[1], 'rb') as f:
        data = f.read()
    read_size = int(argv[2]) if len(argv) > 2 else panel_pipeline.READ_SIZE
    for body in panel_pipeline.replay(data, read_size):
        sys.stdout.write(body.decode('ascii') + '\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
