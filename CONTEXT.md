# Dragons Hub

Basketball club management platform for the HB Dragons: syncs data from the German Basketball Federation and serves club audiences through a web app, a native app, a CMS, and a public site.

## Language

**Fan**:
Anyone using the club's apps signed out — parents, supporters, players checking public data. Sees only the public surfaces.
_Avoid_: guest, anonymous user

**Staff**:
A signed-in person with a club role (admin, referee admin, team manager, coach, referee self-service). Gets the role-driven surfaces and club tooling.
_Avoid_: member, signed-in user

### Native app

**iOS-first**:
The native app's platform priority: iOS gets its full native idiom; Android must keep working but may take a plainer fallback.
_Avoid_: cross-platform parity, uniform UI

**Platform idiom**:
UI built from the platform's own controls and patterns, so the app feels native to the device rather than imitating it.
_Avoid_: look-alike controls, custom chrome

**Structural predictability**:
The user always knows where they are, how they got there, and how to get back — no dead ends, no surprise modal stacks. Ranked above platform idiom when the two conflict.
