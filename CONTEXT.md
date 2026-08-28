# Dragons Hub

Basketball club management platform for the HB Dragons: syncs data from the German Basketball Federation and serves club audiences through a web app, a native app, a CMS, and a public site.

## Language

**Fan**:
Anyone using the club's apps signed out — parents, supporters, players checking public data. Sees only the public surfaces.
_Avoid_: guest, anonymous user

**Staff**:
A signed-in person with a club role (admin, referee admin, team manager, coach, referee self-service). Gets the role-driven surfaces and club tooling.
_Avoid_: member, signed-in user

**Squad**:
The federation-identified group of players behind a club team. Keeps its federation identity for life and ages up through age brackets across seasons (last season's U14 squad can be this season's U16 squad).
_Avoid_: permanent team

**Team entry**:
A club team in one specific season — the thing staff see and manage. Owns the club-facing team data for that season and is connected to exactly one league at a time. A squad has at most one team entry per season.
_Avoid_: team slot, own-club team

**Connected league**:
The one league a team entry plays in for its season. Replaced, never duplicated, when the federation moves the team (e.g. a vorabliga giving way to the committed league).
_Avoid_: assigned league

**Tracked league**:
A league the club follows in a given season; the sync's unit of work. Chosen per season during onboarding and manageable afterwards.
_Avoid_: selected league, subscribed league

**Website / Web-App / Dragons App**:
The club's three front doors, named this way in public-facing text and kept distinct: the **Website** is the public static site on hbdragons.de; the **Web-App** is the signed-in surface on app.hbdragons.de; the **Dragons App** is the native iOS/Android app. Fans meet the Website; Staff meet the Web-App and the Dragons App. One Datenschutzerklärung covers all three because they share one backend (ADR-0006).
_Avoid_: the site vs. the app (ambiguous), frontend, portal

**Season**:
A federation playing year (e.g. 2025/26) that scopes leagues, team entries, fixtures, and results. Data is always read within one season; only a squad's identity carries across the boundary.
_Avoid_: year, period

**Current season**:
The one season the club is operating in, designated centrally on the server and changed only through new-season onboarding — never computed by a client. The Dragons App shows the current season exclusively; past seasons are a Web-App concern.
_Avoid_: active season, latest season

**Vorabliga**:
A preliminary league the federation publishes before promotion/relegation is settled. Carries a full schedule; superseded by a committed league whose fixtures replace it.

### Native app

**iOS-first**:
The native app's platform priority: iOS gets its full native idiom; Android must keep working but may take a plainer fallback.
_Avoid_: cross-platform parity, uniform UI

**Platform idiom**:
UI built from the platform's own controls and patterns, so the app feels native to the device rather than imitating it.
_Avoid_: look-alike controls, custom chrome

**Structural predictability**:
The user always knows where they are, how they got there, and how to get back — no dead ends, no surprise modal stacks. Ranked above platform idiom when the two conflict.
