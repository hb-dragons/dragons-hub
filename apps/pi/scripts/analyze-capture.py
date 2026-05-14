#!/usr/bin/env python3
"""Analyze a raw serial capture for protocol reverse engineering.

Reports size, printable-ASCII ratio, known-token counts, byte histogram,
and a detected repeating period, then prints a verdict.

Usage: analyze-capture.py <capture.bin>
"""
import sys
from collections import Counter

OLD_TOKENS = {b"\xf8\x33": "F833", b"\xe8\xe8\xe4": "E8E8E4", b"\x0d": "0D"}


def printable_ratio(data: bytes) -> float:
    if not data:
        return 0.0
    return sum(1 for b in data if 0x20 <= b <= 0x7E) / len(data)


def find_period(data: bytes, max_period: int = 512) -> int:
    """Smallest period p (>0.9 match) such that data[i] == data[i+p]."""
    n = len(data)
    if n < 64:
        return 0
    window = data[: n // 2]
    best_p, best_score = 0, 0.0
    for p in range(2, min(max_period, n // 2)):
        matches = sum(1 for i in range(len(window)) if data[i] == data[i + p])
        score = matches / len(window)
        if score > best_score:
            best_p, best_score = p, score
    return best_p if best_score > 0.9 else 0


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    data = open(sys.argv[1], "rb").read()
    ratio = printable_ratio(data)
    tokens = {name: data.count(tok) for tok, name in OLD_TOKENS.items()}
    hist = Counter(data).most_common(10)
    period = find_period(data)

    print(f"file        : {sys.argv[1]}")
    print(f"size        : {len(data)} bytes")
    print(f"ascii ratio : {ratio:.2f}")
    print("old tokens  : " + ", ".join(f"{k}={v}" for k, v in tokens.items()))
    print("top bytes   : " + ", ".join(f"{b:02x}:{c}" for b, c in hist))
    print(f"period      : {period if period else 'none'}")

    old_protocol = tokens["F833"] > 0 and ratio > 0.40
    verdict = (
        "LIKELY OLD PROTOCOL (mis-framed?)"
        if old_protocol
        else "UNRECOGNIZED - candidate new protocol"
    )
    print(f"verdict     : {verdict}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
