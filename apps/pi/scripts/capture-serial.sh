#!/usr/bin/env bash
# capture-serial.sh — record raw bytes from a serial port at a given
# baud/framing, for protocol reverse engineering.
#
# The caller is responsible for stopping panel2net.service first (only one
# reader can own the port) and restarting it afterwards.
#
# Usage: capture-serial.sh <baud> <framing> <seconds> <label>
#   framing in: 8N1 7E1 7O1 7N2 8E1 8O1
# Output: ~/captures/<label>.bin
set -euo pipefail

PORT=/dev/ttyACM0
OUTDIR="$HOME/captures"

baud="${1:?usage: capture-serial.sh <baud> <framing> <seconds> <label>}"
framing="${2:?missing framing}"
secs="${3:?missing seconds}"
label="${4:?missing label}"

case "$framing" in
  8N1) flags="cs8 -parenb -cstopb" ;;
  7E1) flags="cs7 parenb -parodd -cstopb" ;;
  7O1) flags="cs7 parenb parodd -cstopb" ;;
  7N2) flags="cs7 -parenb cstopb" ;;
  8E1) flags="cs8 parenb -parodd -cstopb" ;;
  8O1) flags="cs8 parenb parodd -cstopb" ;;
  *) echo "unknown framing: $framing (want 8N1 7E1 7O1 7N2 8E1 8O1)" >&2; exit 1 ;;
esac

mkdir -p "$OUTDIR"
out="$OUTDIR/${label}.bin"

stty -F "$PORT" raw "$baud" $flags -echo
timeout "$secs" cat "$PORT" > "$out" || true

echo "captured $(wc -c < "$out") bytes -> $out  (baud=$baud framing=$framing ${secs}s)"
