# Match cards in sports apps: fixture and result rows on phones (2026-11-11)

Research note for one open design question in `apps/native`: how the Spielplan
card should show long federation team names ("Basketballgemeinschaft
Dorsten-Hervest 2") on a ~390pt phone, given that the federation's short codes
(BOTH2, TKH2) are cryptic, not every club has a crest, and large accessibility
text sizes must work. No app code was changed.

**Method.** Evidence is limited to primary sources: official App Store listings
(German storefront) and their screenshots, first-party public API responses,
Apple's HIG and Google's Material/Android docs. Screenshots were pulled through
Apple's lookup API (`https://itunes.apple.com/lookup?id=<id>&country=de`,
field `screenshotUrls`) on 2026-11-11, downloaded, and looked at. "Screenshot
*n*" below is the 1-based position in that array. Layout descriptions come from
the image, not from memory of the app.

**Caveats that apply to every app section.**

- Store screenshots are marketing images. They show the cases the publisher
  picked (short, famous names) and can be years old (FUSSBALL.DE's show dates
  from 2019). They prove a layout exists; they do not prove it is the current
  build or the only layout.
- None of the screenshots shows a large Dynamic Type size. How each app behaves
  at accessibility sizes is **not verified** for any of them.
- Local copies live in the session scratchpad and are temporary:
  `/private/tmp/claude-501/-Users-jn-git-dragons-all/6555fbf9-cbce-41f3-bf60-942dbcbc7229/scratchpad/research-shots/`
  (`<app>-<n>.jpg` thumbnails, `hi/<app>-<n>.jpg` 900px versions, `hi/c-*.jpg`
  crops, `sheets/<app>.jpg` contact sheets). Re-fetch from the lookup URL if
  they are gone.

---

## Summary

1. **Stacked two-row is the dominant list layout** for multi-competition lists:
   one team per line, crest left of the name, score or kickoff time in a right
   column. Seen in ESPN, Flashscore, OneFootball, theScore, FUSSBALL.DE and the
   DBB app. The team name gets the full row width minus one narrow column.
2. **Inline "home – score – away" on one line** is used where names are short
   or pre-shortened: FotMob, kicker, FuPa, NBA, EuroLeague, FIBA. Every one of
   these either has a curated short name or truncates.
3. **Apps with inline rows carry a short-name tier in their data.** FuPa:
   `full` / `middle` / `short` per team and per club. ESPN: `displayName` /
   `shortDisplayName` / `abbreviation`. EuroLeague: `name` / `abbreviatedName` /
   `editorialName` / `tvCode`. theScore: `full_name` / `medium_name` /
   `short_name` / `abbreviation`. The federation API we sync has only two:
   `teamname` and `teamnameSmall` (a 2-5 character code). The useful middle tier
   ("Stg. Kickers", "H.-Freiberg", "Miss Valley St") is missing from our source.
4. **Tricodes appear only where fans already know them** (NBA "NYK", theScore
   widgets, EuroLeague box score) or in space-starved secondary views. No
   amateur app examined uses codes as the primary label in a fixture list.
5. **Amateur apps show the full name and accept overflow.** FUSSBALL.DE: one
   line, tail ellipsis ("FSG Pollhagen-Nordsehl-Lauenha…"). kicker amateur:
   tail ellipsis ("SVG Göttinge…"). DBB.Scores: wraps to three lines, then
   ellipsis ("REGIOTEAM STUTTGART - BASKETBALL AI…"). DBB app: full names,
   stacked, no crest at all.
6. **Date placement:** multi-day lists put the date in a section header and
   leave only the time in the row (FUSSBALL.DE, OneFootball, easyCredit BBL,
   Flashscore's day strip). A left date column inside the row appears in
   compact history lists (Flashscore head-to-head and favourites, NBA team
   schedule, ESPN team schedule).
7. **Single-team schedules use "vs" / "@" plus the opponent only** (NBA, ESPN)
   or a small home/away glyph (FotMob widget). The own team is not repeated.
   The result is "W/L + score" (ESPN) or "score + W badge" (FotMob).
8. **Win/loss marking in two-team rows is typographic:** the winner's name
   and score are bold (Flashscore), or a small arrow sits next to the winning
   score (ESPN). Coloured W/L badges and coloured score cells are used in
   single-team views (FotMob widget, FuPa widget, kicker form strip).
9. **Venue is almost never in the list row.** Only EuroLeague's game-centre
   card shows the arena. Everyone else leaves it to the detail screen.
10. **Platform guidance sides with wrapping over truncation at large sizes**
    and tells you to restack horizontally adjacent items (Apple HIG,
    Typography and Layout). Material caps list items at three lines of text.

---

## Per-app findings

### NBA app (NBA Media Ventures)

- **Fixture row (league games list, screenshot 2):** one line per game. Crest
  at far left and far right with the team nickname in small type under each
  crest ("Warriors", "Lakers"); kickoff time ("8:00PM") or live clock centred.
  Date is a week strip above the list.
- **Result/live row:** same row; large scores sit between crest and centre
  status.
- **Single-team schedule (screenshot 8):** table "MATCHUPS / TIME (EST)".
  Each row: `Oct 20   @  [crest] NYK   7:00 PM`. Date left, "@" or "vs", crest,
  bold tricode, time right-aligned. Own team is not shown in the row.
- **Long names:** avoided by data. Nickname under crest in the league list,
  tricode in the team schedule. Full "Oklahoma City Thunder" appears only in a
  chat table, wrapped to two lines (screenshot 9).
- **Sources:** <https://apps.apple.com/de/app/nba-live-ergebnisse-termine/id484672289>;
  local `hi/nba-8.jpg`, `hi/nba-2.jpg`, `sheets/nba.jpg`.
- Name fields in NBA's own API: **not verified** (cdn.nba.com returned
  "Access Denied" to a scripted request).

### ESPN

- **Fixture/result row (scores list, screenshot 8):** stacked. Two lines, each
  `[crest] Nickname ……… score`. Scores right-aligned in a column, then a
  vertical divider, then a status column (live clock in red, or "Final", plus
  broadcaster and a Watch/Highlights button). College rows add a small rank
  number before the name.
- **Winner indicator:** a small triangle next to the winning score, loser's
  score dimmed ("Alabama 39 ◂ / LSU 31").
- **Single-team schedule (espn.com team schedule table):** columns DATE /
  OPPONENT / RESULT / W-L. Opponent cell is `vs|@ [crest] Location`
  ("@ Detroit", "vs New York"); result cell is `W 107-103` or `L 121-113`.
  Verified from the page HTML, not from an app screenshot.
- **Long names:** solved in data. The public site API returns `displayName`
  "Boston Celtics", `shortDisplayName` "Celtics", `abbreviation` "BOS", plus
  `location` and `name`. For long college names the short tier is hand-made:
  "Mississippi Valley State Delta Devils" → "Miss Valley St" → "MVSU";
  "Texas A&M-Corpus Christi Islanders" → "Texas A&M-CC" → "AMCC". Events carry
  `name` "Boston Celtics at Detroit Pistons" and `shortName` "BOS @ DET".
- **Sources:** <https://apps.apple.com/de/app/espn-live-sports-scores/id317469184>;
  <https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/bos>;
  <https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=400>;
  <https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/bos/schedule>;
  <https://www.espn.com/nba/team/schedule/_/name/bos>; local `hi/espn-8.jpg`.

### theScore

- **Fixture row (favourites, screenshot 1):** stacked. `[crest] Bills` /
  `[crest] Texans`, betting line in a middle column, kickoff "1:00 PM" right,
  broadcaster chip on a third line. Date is a day strip above.
- **Result (widgets, screenshot 8; matchup header, screenshot 9):** widgets use
  crest + tricode + score ("NYK 94 · Final · SAS 90"). The matchup header
  stacks `[crest] Knicks ……… 94` / `[crest] Spurs ……… 90` with record beneath.
- **Long names:** data tiers. `https://api.thescore.com/nba/teams` returns
  `full_name` "Boston Celtics", `medium_name` "Celtics", `short_name` "BOS",
  `abbreviation` "BOS", `location` "Boston".
- **Sources:** <https://apps.apple.com/de/app/thescore-sports-news-scores/id285692706>;
  <https://api.thescore.com/nba/teams>; local `sheets/thescore.jpg`.

### FotMob

- **Fixture row (screenshot 1):** inline, centred on the time.
  `Union Berlin [crest] 15:30 [crest] Frankfurt`. Home name right-aligned
  against its crest, away name left-aligned. Rows grouped under a competition
  header; date is a day strip.
- **Result row:** not shown in a list screenshot. **Not verified.**
- **Single-team view (home-screen widget, screenshot 10):** two blocks,
  "Vorheriges" and "Nächstes". Each: home/away glyph + opponent name on the
  left; date on the right with score and a green "W" badge (previous) or
  kickoff time (next). Own team appears once, as the widget title.
- **Long names:** short display names ("M'gladbach", "Leverkusen", "Köln",
  "Frankfurt") in the list; tail ellipsis in the widget
  ("Borussia Mönchen…").
- **Sources:** <https://apps.apple.com/de/app/fotmob-fu%C3%9Fball-ergebnisse/id488575683>;
  local `hi/fotmob-1.jpg`, `hi/fotmob-10.jpg`.
- Name fields in FotMob's API: **not verified** (empty response).

### Sofascore

- Store screenshots show match detail headers (crest, short name below, score
  centred: "Barcelona 3 - 3 Inter"), notifications ("Barcelona - Inter"), and
  player/statistics screens. **No fixture list row is shown**, so list layout
  and lower-league name handling are **not verified**. The public API returned
  403 to a scripted request.
- **Source:** <https://apps.apple.com/de/app/sofascore-live-ergebnisse/id1176147574>;
  local `sheets/sofascore.jpg`.

### Flashscore

- **Fixture/live row (screenshot 1):** stacked. Favourite star, then two lines
  `[crest] Bayern München` / `[crest] TSG Hoffenheim`; live minute and scores
  in right columns (one score per line, aligned with its team). Upcoming games
  show the time in the right column. Grouped under a competition header; date
  is a day strip.
- **Result row (head-to-head list, screenshot 9):** date in a narrow left
  column ("12.05."), then stacked `[crest] Los Angeles Lakers` /
  `[crest] Oklahoma City Thunder`, scores right. **Winner's name and score are
  bold**, loser regular. Full 21-character names fit on one line at this size.
- **Favourites (screenshot 5):** left column carries date over time
  ("18.03." / "21:00"), then the same stacked team block.
- **Long names:** full names, stacked layout gives them the row. Overflow
  behaviour for longer names is **not verified** (none in the screenshots).
- **Sources:** <https://apps.apple.com/de/app/flashscore-ergebnisse-news/id766443283>;
  local `hi/flashscore-1.jpg`, `hi/flashscore-5.jpg`, `hi/flashscore-9.jpg`.

### OneFootball

- **Fixture row (matchday list, screenshots 3 and 6):** stacked.
  `[crest] Borussia Mönchengladbach` / `[crest] Bayer 04 Leverkusen`, a
  vertical divider, then the time in a right column with a "STREAM" tag below.
  Date is a section header on two lines ("Freitag" / "23. August").
- **Result:** crest-only tiles in the "Teamform" grid (two crests, score,
  coloured dot for W/D/L; screenshot 4). A list result row is **not verified**.
- **Long names:** full official names ("Borussia Mönchengladbach", 24 chars)
  on one line. The web page data carries a single `name` per team; no short
  tier was visible in the page payload.
- **Sources:** <https://apps.apple.com/de/app/onefootball-fu%C3%9Fball-news/id382002079>;
  <https://onefootball.com/de/wettbewerb/bundesliga-1/spiele>; local
  `sheets/onefootball.jpg`.

### kicker

- **Amateur result row (screenshot 8, Landesliga Braunschweig):** inline.
  `FT Braunschweig [crest] 3 : 1 [crest] SVG Göttinge…`. Score in a dark box
  in the centre, crests hug the score, names outside. Matchday and date sit in
  a centred header line above ("33. SPIELTAG: SONNTAG, 02. JUNI 2024").
- **W/L:** separate "S / U / N" counters (Sieg/Unentschieden/Niederlage) and a
  form strip of crests only, each underlined green/grey/red.
- **Long names:** tail ellipsis on the away side at 13 characters, in the
  publisher's own marketing image.
- **Basketball (screenshot 9):** header "Boston 106 : 88 Dallas", tricodes
  "BOS"/"DAL" only in the timeline.
- **Sources:** <https://apps.apple.com/de/app/kicker-fu%C3%9Fball-news/id367342259>;
  local `hi/kicker-8.jpg`, `hi/kicker-9.jpg`.
- kicker.de markup and name fields: **not verified** (bot challenge).

### DAZN

- Screenshots show video, a match stats header ("Bayern 4 - 3 Real Madrid",
  crest above short name) and crest pairs with two short names stacked
  underneath ("FC Bayern" / "Köln"). **No fixture list row is shown.** List
  layout **not verified**.
- **Source:** <https://apps.apple.com/de/app/dazn-sport-live-stream/id1129523589>;
  local `sheets/dazn.jpg`.

### easyCredit BBL (official)

- **Fixture row (the listing's only screenshot):** a three-column table
  "UHRZEIT / TEAMS / SPIELINFO". Left: time in bold italics with the matchday
  beneath ("22:30" / "1. Spieltag"). Middle: **two crests stacked, no team
  names at all**. Right: an info button. Date and round are a section header
  above each table ("Donnerstag, 23.09.2021" / "Hauptrunde"). A
  PLAYED/UPCOMING toggle sits on top.
- **Long names:** sidestepped. Crest-only works for 18 professional clubs with
  known logos; it has no fallback for a missing crest.
- Screenshot is dated 2021; the current build is **not verified**. API
  returned 401.
- **Source:** <https://apps.apple.com/de/app/easycredit-bbl/id1584536979>;
  local `sheets/bbl.jpg`.

### BARMER 2. Basketball Bundesliga (official league app, Softceed)

- **Fixture row (screenshot 1):** inline, crest-only. Large crest left, large
  crest right; centre column has "Mi. 12.04.2023 19:00", "-:-", "Spieltag: 31".
  No names. Tabs LETZTE / AKTUELLE / NÄCHSTE; date also as a section header.
- **Detail header (screenshot 3):** title uses codes ("ART vs PB").
- **Source:** <https://apps.apple.com/de/app/barmer-2-basketball-bundesliga/id1082190253>;
  local `sheets/bbl2.jpg`.

### EuroLeague (official)

- **Fixture card (game centre, screenshot 3):** one card per game. Date on
  top ("10 APRIL 2025"), then `[crest] 9:00 PM [crest]`, then short names
  "ASVEL vs Monaco", then the **arena in small caps** ("ASTROBALLE"), then
  broadcast and ticket links.
- **Result (screenshot 4):** "FINAL SCORE", crest–score–score–crest, short
  names below ("Bayern vs Paris"), arena below. Quarter table uses tricodes
  ("BAY", "PBB").
- **Long names:** four tiers in the public API. Example:
  `name` "Anadolu Efes Istanbul", `abbreviatedName` "Anadolu Efes",
  `editorialName` "Efes", `tvCode` "EFS".
- **Sources:** <https://apps.apple.com/de/app/euroleague-mobile/id567716614>;
  <https://api-live.euroleague.net/v2/competitions/E/seasons/E2025/clubs?limit=2>;
  local `sheets/euroleague.jpg`.

### FIBA (World Cup 2027 Qualifiers app)

- **Result row (screenshot 4):** inline. Flag left and right with the country
  name in small type beneath each; scores and "FINAL" centred; group label
  above the row. Date is a tab strip.
- **Long names:** country names only; not comparable to club names. Overflow
  **not verified**.
- **Source:** <https://apps.apple.com/de/app/fiba-basketball-world-cup-2027/id1309578910>;
  local `sheets/fiba.jpg`.

### FUSSBALL.DE (DFB, amateur football)

- **Fixture row ("Meine Spiele", screenshot 3):** stacked, closest to our use
  case because it mixes one user's teams across leagues. Per row:
  a grey overline "Herren | Kreisliga" (team type and league), then
  `[crest] FSG Pollhagen-Nordsehl-Lauenha…` / `[crest] TuS Niedernwöhren`,
  time right ("15:00 Uhr"), bell icon far right. Date is a bold section
  header ("SONNTAG, 14.04.2019"). Tabs: NÄCHSTE SPIELE / LETZTE SPIELE /
  HEUTE LIVE.
- **Result row:** the LETZTE SPIELE tab is not shown. **Not verified.**
- **Long names:** full name, **single line, tail ellipsis** when it collides
  with the time column (cut at about 31 characters). No codes, no short names.
  The match header (screenshot 5) wraps under the crest instead:
  "VfL Bückeburg II" / "(U 23)".
- **Source:** <https://apps.apple.com/de/app/fussball-de/id901148836>; local
  `hi/fussballde-3.jpg`, `sheets/fussballde.jpg`.

### FuPa (amateur football)

- **Single-team schedule (home-screen widget, screenshot 3,
  "Spielplan TuS 1860 Pfarrkirchen"):** inline, one line per game.
  `Hebertsfeld. [crest] 0:3 [crest] Pfarrkirchen`. Centre cell is the score
  on a green/red/grey background for win/loss/draw from the followed team's
  point of view, or the date ("13.11.") for future games. No time, no venue.
- **Match header (screenshot 1):** crest above name, score centred
  ("TSV Steinbach Haiger 4:0 Offenbach").
- **Long names:** a curated three-tier model. The public API returns, per
  team, `name.full` / `name.middle` / `name.short`, and per club `name` /
  `middleName` / `shortName`. Examples from one response:
  "SGV Heilbronn-Freiberg" → "H.-Freiberg" → "SGVHF";
  "SG Barockstadt Fulda Lehnerz" → "Barockstadt" → "SGBar";
  "SV Stuttgarter Kickers" → "Stg. Kickers" → "Stuki";
  "1. FC Kaiserslautern" → "FC K´lautern" → "FCK". The widget uses the middle
  tier ("R'felden", "Hebertsfeld.", "Schalding II"), which is why ten games
  fit in one widget without ellipsis.
- **Sources:** <https://apps.apple.com/de/app/fupa/id942371609>;
  <https://api.fupa.net/v1/competitions/regionalliga-suedwest/seasons/current/matches?limit=40>;
  local `hi/fupa-3.jpg`, `sheets/fupa.jpg`.
- FuPa's in-app league match list (as opposed to the widget) is
  **not verified**.

### DBB app (official, Basketball Werbe Agentur)

- **Fixture/result row (league view, screenshots 4-5):** stacked, text only.
  Grey card per game with two lines of full team names ("EN Baskets Schwelm" /
  "Iserlohn Kangaroos"); date and time right-aligned on two lines
  ("23.Jan" / "13.00") with a chevron. **No crests, no codes.** Tabs AKTUELL /
  TABELLE / DEMNÄCHST.
- **Long names:** full `teamname`. The screenshot shows only ProB names up to
  24 characters, so overflow is **not verified**.
- **Source:** <https://apps.apple.com/de/app/dbb/id652095890>; local
  `hi/dbb-4.jpg`.

### DBB.Scores (official DBB live-stats app, youth to amateur)

- **Result header (screenshots 1, 2, 3, 5):** stacked, one team per block.
  `[crest] NAME   P1 P2 P3 P4   total`. Names are bold uppercase. Date and
  time sit in a bar above ("07/11/25-20:00h") with a status pill ("Beendet").
- **Long names:** this is the only app examined that shows real federation
  amateur names, and it **wraps**: "SVD 49 DORTMUND 3" on two lines,
  "TV ARMINIUS 1884 DTMD. WICKEDE" on three, and
  "REGIOTEAM STUTTGART - BASKETBALL AI…" on three with a tail ellipsis. The row
  grows in height.
- **Missing crest:** "TV ARMINIUS 1884 DTMD. WICKEDE" has no crest; the name
  starts at the row's left edge and takes the crest's width. No placeholder.
- This is a match header, not a list row. Its fixture list is **not verified**.
- **Source:** <https://apps.apple.com/de/app/dbb-scores/id1592686052>; local
  `hi/dbbscores-2.jpg`, `hi/dbbscores-5.jpg`.

### basketball-bund.net (federation data)

- The public REST response for a league schedule carries exactly two name
  forms per team: `teamname` ("Baskets Juniors TSG Westerstede") and
  `teamnameSmall` ("WST"). There is no middle tier. Mirrored in
  `packages/sdk/src/types/common.ts` (`SdkTeamRef`).
- **Source:** <https://www.basketball-bund.net/rest/competition/spielplan/id/55815>
  (Herren ProB Nord, fetched 2026-11-11).

### handball.net (DHB)

- **Favourites list (screenshot 3):** two-line item: crest, team name
  ("TV Aldekerk 07"), league below in grey ("3. Liga Männer"); long league
  names wrap to a second grey line ("Regionsklasse Männer (Krefeld-Grenzland
  2024/25)").
- **Push notification (screenshot 4):** "SG Kappelwindeck/Stein…", tail
  ellipsis.
- **Embeddable standings widget (screenshot 8):** team column truncated hard
  ("HSG…", "TuS F…", "mHSG Friesenhei…").
- **Fixture row:** partly visible behind a dialog in screenshot 6 (date header
  "Samstag, 14.9.2024", crest + name lines, time right), too dim to describe
  reliably. **Not verified.** API not reachable by script.
- **Source:** <https://apps.apple.com/de/app/handball-net/id1582777457>; local
  `sheets/handballnet.jpg`.

---

## Comparison table

| App | Layout | Date position | Name form in list | Overflow behaviour seen | Crest | W/L indicator |
|---|---|---|---|---|---|---|
| NBA (league list) | inline | week strip above | nickname under crest | none needed | yes, primary | none (score only) |
| NBA (team schedule) | single-team, one line | left column in row | tricode | none needed | yes | not shown (fixtures only) |
| ESPN | stacked | section/status column right | `shortDisplayName` (nickname) | none seen | yes | triangle at winning score, loser dimmed; "W/L + score" in team schedule |
| theScore | stacked | day strip above | `medium_name`; tricode in widgets | none seen | yes | none seen |
| FotMob | inline | day strip above | short name | tail ellipsis (widget) | yes | green "W" badge (team widget) |
| Sofascore | not verified | not verified | not verified | not verified | yes (header) | not verified |
| Flashscore | stacked | day strip; left column in H2H/favourites | full name | none seen | yes | winner bold |
| OneFootball | stacked | section header | full name | none seen | yes | coloured dot (form tiles) |
| kicker (amateur) | inline | centred header line | full name | tail ellipsis | yes | S/U/N counters, coloured form strip |
| DAZN | not verified | not verified | short name (header) | not verified | yes | not verified |
| easyCredit BBL | stacked, crest-only | section header; time left in row | none | n/a | yes, only label | not verified |
| 2. BBL | inline, crest-only | centre of row + section header | none (codes in detail title) | n/a | yes, only label | not verified |
| EuroLeague | inline card | top of card | `abbreviatedName`; `tvCode` in tables | none seen | yes | none seen |
| FIBA | inline | tab strip | country name under flag | not verified | flag | none seen |
| FUSSBALL.DE | stacked | section header; time right | full name | single line, tail ellipsis | yes | not verified |
| FuPa (team widget) | inline | centre cell (future games) | curated `middle` name | none needed | yes | score cell coloured green/red/grey |
| DBB app | stacked, text only | right column (date over time) | full `teamname` | not verified | no | none seen |
| DBB.Scores (match header) | stacked | bar above | full name, uppercase | wraps to 3 lines, then ellipsis | yes; omitted when missing | none (scores coloured per team) |
| handball.net | stacked (favourites) | section header (dim) | full name | tail ellipsis (push, widget) | yes | not verified |

---

## Platform guidance

### Apple Human Interface Guidelines

- **Typography › Supporting Dynamic Type**
  (<https://developer.apple.com/design/human-interface-guidelines/typography>):
  - "Keep text truncation to a minimum as font size increases. In general, aim
    to display as much useful text at the largest accessibility font size as
    you do at the largest standard font size. Avoid truncating text in
    scrollable regions unless people can open a separate view to read the rest
    of the content. You can prevent text truncation in a label by configuring
    it to use as many lines as needed to display a useful amount of text."
  - "Consider adjusting your layout at large font sizes. When font size
    increases in a horizontally constrained context, inline items (like glyphs
    and timestamps) and container boundaries can crowd text and cause
    truncation or overlapping. To improve readability, consider using a
    stacked layout where text appears above secondary items. Multicolumn text
    can also be less readable at large sizes due to horizontal space
    constraints. Reduce the number of columns when the font size increases to
    avoid truncation and enhance readability."
  - "Prioritize important content when responding to text-size changes. Not
    all content is equally important. When someone chooses a larger text size,
    they typically want to make the content they care about easier to read;
    they don't always want to increase the size of every word on the screen."
  - "Increase the size of meaningful interface icons as font size increases."
  - "Maintain a consistent information hierarchy regardless of the current
    font size."
  - Size tables on the same page: the iOS Body style is 17pt at the default
    "Large" size and 53pt at AX5, about 3.1x. Footnote goes from 13pt to 44pt.
- **Layout**
  (<https://developer.apple.com/design/human-interface-guidelines/layout>):
  "Support Dynamic Type by adjusting your layout to accommodate text at larger
  sizes. For example, horizontally adjacent views may need to stack vertically
  to provide more space for text; table rows or other containers may need to
  grow in height so that text isn't cropped or doesn't overlap other content;
  and table rows with a single line of text by default might need to grow
  vertically to accommodate multiple lines of text."
- **Lists and tables**
  (<https://developer.apple.com/design/human-interface-guidelines/lists-and-tables>):
  "Keep item text succinct so row content is comfortable to read. Short,
  succinct text can help minimize truncation and wrapping, making text easier
  to read and scan." And: "Sometimes, an ellipsis in the middle of text can
  make an item easier to distinguish because it preserves both the beginning
  and the end of the content." The second point matters for our names: the
  distinguishing part is often at the end (the team number "2", "3").
- **Accessibility**
  (<https://developer.apple.com/design/human-interface-guidelines/accessibility>):
  "Ideally, give people the option to enlarge text by at least 200 percent."

### Material Design / Android

- **Material 3 lists.** Anatomy is leading element (icon, avatar or image),
  headline, optional supporting text, optional trailing supporting text. List
  items come in three sizes: "One-line list items contain a maximum of one
  line of text", two-line "a maximum of two lines", three-line "a maximum of
  three lines". The anatomy includes "Leading avatar label text", which is the
  standard fallback when there is no image. Source: Google's component doc,
  <https://github.com/material-components/material-components-android/blob/master/docs/components/List.md>.
  The full guideline page at <https://m3.material.io/components/lists/guidelines>
  is client-rendered and could not be read by script; its wording on
  truncation is **not verified**.
- **Android 14 font scaling**
  (<https://developer.android.com/about/versions/14/features#non-linear-font-scaling>):
  "Starting in Android 14, the system supports font scaling up to 200%" with a
  nonlinear curve so that "large text doesn't scale at the same rate as
  smaller text". Developers "should still perform UI testing with the maximum
  font size enabled (200%)". "Don't use sp units for padding or define view
  heights assuming implicit padding."

### React Native hooks for the above

`Text` exposes `numberOfLines`, `ellipsizeMode` (head/middle/tail/clip),
`adjustsFontSizeToFit` with `minimumFontScale`, and `maxFontSizeMultiplier`
(<https://reactnative.dev/docs/text>). No app examined visibly shrinks team
names to fit; whether any does is **not verified**.

---

## Applies to us

Our card is a single-club list across many squads: per the brief, a left
column (date, weekday + time, Heim/Auswärts) and a right block with our team
and the opponent; results add a W/L badge and the score. The constraints that
differ from every professional app above: names up to 40+ characters, no
middle-length name in the source data, cryptic codes, and incomplete crests.

Width budget, as an estimate (not measured in the app): 390pt screen, 16pt
card inset each side, a ~64pt date column and 12pt gap leave about 280pt; a
24pt crest and 8pt gap leave about 250pt for the name. At a 16pt semibold
face that is roughly 28-30 characters per line, so a 40-character name needs
two lines at default size and three or more from about xxLarge upward.

### 1. Stacked team rows, crest slot + full name, two lines max, date column kept; restack at large text (recommended)

- **What:** keep the left date column. On the right, one row per team:
  crest slot, then the full `teamname` with `numberOfLines={2}`. Score for each
  team right-aligned on its own row; winner in bold. Above an accessibility
  threshold (font scale around 1.3-1.5), move the date/time/Heim-Auswärts line
  to the top of the card and give team rows the full width.
- **Evidence:** stacked crest + full name is the majority layout (Flashscore,
  ESPN, OneFootball, theScore, FUSSBALL.DE). Flashscore's head-to-head and
  favourites rows are this exact shape: date in a left column, stacked teams,
  scores right, winner bold. DBB.Scores shows that real federation names need
  wrapping and that a growing row is acceptable in an official DBB product.
  HIG Typography asks for "as many lines as needed" over truncation and a
  "stacked layout where text appears above secondary items" at large sizes.
- **40+ characters:** two lines at default size by the estimate above; a
  third line is cut. Use `ellipsizeMode="middle"` or keep the trailing team
  number visible another way, since "… 2" versus "… 3" is the distinguishing
  part (HIG Lists and tables, middle ellipsis).
- **Missing crest:** fixed-width slot with an initials/code avatar
  (Material's "leading avatar label text") so names stay aligned. The
  federation code is acceptable here because it is a decoration next to the
  full name, not the label. DBB.Scores instead drops the slot, which
  misaligns names in a list.
- **Large text:** the restack removes the date column's width cost; rows grow
  in height (HIG Layout). At AX sizes lift the line cap to 3-4.
- **Cost:** variable row height; two layouts to test.

### 2. Date on its own line (or section header), team rows full width at all sizes

- **What:** drop the left column. Date and time become a header line in the
  card, or a sticky day header with only the time in the row. Team rows as in
  option 1.
- **Evidence:** FUSSBALL.DE "Meine Spiele", OneFootball and easyCredit BBL all
  use a date section header and keep only the time in the row. FUSSBALL.DE
  also puts squad type and league in a grey overline above the teams, which
  maps onto our "which of our squads is this" problem.
- **40+ characters:** about 310pt for the name (estimate), roughly 36
  characters per line; most names fit on one line, the longest on two.
- **Missing crest:** same avatar slot as option 1.
- **Large text:** already the layout HIG recommends for large sizes; one
  layout for every size.
- **Cost:** loses the large scannable date that the current card has, and day
  headers are thin when a club has one game per day. Ranked second because it
  is the simpler build but changes more of the existing design.

### 3. Add a curated middle-length name tier, show it in the list, full name on the detail screen

- **What:** a per-club display name of about 12-18 characters ("BG
  Dorsten-Hervest 2", "Jahn Lindhorst 3"), derived by rules (drop
  "Basketball", shorten "Basketballgemeinschaft" to "BG") with an admin
  override, stored next to the synced name. Use with the layout of option 1
  or 2.
- **Evidence:** every app that keeps names on one line has this tier in its
  data: FuPa `middle` / `middleName`, ESPN `shortDisplayName`, EuroLeague
  `abbreviatedName`, theScore `medium_name`. FuPa is the amateur precedent and
  its values are hand-made, not algorithmic ("H.-Freiberg", "Barockstadt").
  HIG Lists and tables: "Keep item text succinct". The federation API has no
  such field.
- **40+ characters:** solved at the source; one line at default size.
- **Missing crest:** unchanged; still needs the avatar slot.
- **Large text:** helps most here, since short names survive 2-3x scaling
  where full names cannot.
- **Cost:** data work and upkeep for every opponent club across all leagues;
  wrong automatic abbreviations are worse than a wrapped full name. Ranked
  third as a follow-up that improves option 1 or 2, not a replacement for
  handling the full name.

### 4. Crest + federation short code as the primary label (not recommended for the list)

- **What:** `vs [crest] BOTH2` in the NBA team-schedule style.
- **Evidence:** NBA and theScore widgets do this, with tricodes fans already
  know. The official BBL apps go further and show crests only. No amateur app
  examined uses codes as the list label; FUSSBALL.DE, kicker, the DBB app and
  DBB.Scores all show the full name, and FuPa built readable middle names
  instead of using its own `short` codes ("SGVHF", "TSVSH") in the schedule.
- **40+ characters:** not an issue.
- **Missing crest:** fails. Without a crest the row is a bare code such as
  "TKH2", which identifies nothing to a parent or new member.
- **Large text:** best of all four.
- **Use it for:** compact secondary surfaces only (form strip, widget, chip),
  and only alongside a crest.

The "vs / @ opponent only" idea from single-team schedules (NBA, ESPN, FotMob
widget) does not transfer directly: our list spans many squads, so the own-team
line carries information. It could shrink to a squad chip or overline
(FUSSBALL.DE's "Herren | Kreisliga" line) to free a row for the opponent's
second line. That variant is compatible with options 1 and 2.

---

## Not verified

- Behaviour of **any** examined app at large Dynamic Type / Android font
  scale. No screenshot shows it and no app was installed.
- Whether store screenshots match current builds (FUSSBALL.DE 2019,
  easyCredit BBL 2021, 2. BBL 2023 images).
- Fixture **list** rows for Sofascore and DAZN (not in their screenshots).
- Result list rows for FotMob, OneFootball, FUSSBALL.DE ("Letzte Spiele"),
  easyCredit BBL ("Played"), handball.net.
- FuPa's in-app match list (only the widget and match header were seen);
  DBB.Scores' fixture list (only match headers were seen).
- Overflow behaviour with very long names in Flashscore, OneFootball, ESPN,
  theScore, the DBB app and FIBA: their screenshots contain no long names.
- Name fields in the NBA, FotMob, Sofascore, kicker, easyCredit BBL and
  handball.net APIs (blocked, empty or unauthorised responses to scripted
  requests). Sofascore lower-league handling in particular.
- Whether any app shrinks the font to fit team names.
- Google Play listings (only App Store listings were used).
- Material 3's guideline text on truncation versus wrapping in list items
  (page is client-rendered); only the component doc's anatomy and line limits
  were read.
- Official design or engineering write-ups by these companies about match-row
  design: none were searched out or cited.
- The width and characters-per-line figures in "Applies to us" are estimates,
  not measurements from the app.
