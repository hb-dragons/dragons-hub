---
status: accepted
---

# iOS-first native app

`apps/native` is an Expo app that compiles for both platforms, but every user is on iOS — no Android build has ever been produced (`apps/native/RELEASES.md`). We design iOS-first: iOS gets the full platform idiom (native tab bar, SF Symbols, native sheet presentation, system chrome), while Android only has to keep compiling, taking the plainest acceptable fallback. New work does not hand-build polished Android fallback UI.

## Considered options

- **Strict cross-platform parity** — rejected: it taxes every change for a platform with zero users, and parity-first UI tends toward a neither-platform look.
- **Deleting Android support** — rejected: Expo keeps Android compilation nearly free, so deleting it burns the option of a later Android launch for no gain.

## Consequences

Screens will visibly diverge between platforms over time. An eventual Android launch is a deliberate polish pass, not just a build. Canonical vocabulary ("iOS-first", "Platform idiom") lives in `CONTEXT.md`.
