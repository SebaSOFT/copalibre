## [2.0.0](https://github.com/SebaSOFT/copalibre/compare/v1.2.6...v2.0.0) (2026-11-27)

### Breaking changes

- **Every API route lives under `/api`** (OpenAPI 8.0.0 → 9.0.0). Health and readiness are `/api/health` and `/api/ready`, the key set is `/api/auth/jwks.json`, and `/.well-known/jwks.json` is removed. The refresh cookie's path is `/api/auth`. The events long poll moves from `/api/events` to `/events/poll`. Point every client, proxy rule and `COPALIBRE_JWKS_URI` at the new paths ([#507](https://github.com/SebaSOFT/copalibre/pull/507), [#503](https://github.com/SebaSOFT/copalibre/pull/503)).
- **Control holds its access token in an `HttpOnly` session cookie** (OpenAPI 9.0.0 → 10.0.0). Native login, invitation acceptance and refresh set the session, CSRF and refresh cookies and answer with session metadata only; an OIDC token is exchanged through `POST /api/auth/session`; unsafe cookie-authenticated requests need the CSRF header. Bearer clients and personal access tokens are unchanged ([#513](https://github.com/SebaSOFT/copalibre/pull/513)).
- **Personal-data defaults** (OpenAPI 7.6.0 → 8.0.0): tournaments declare whether they include minors, youth profiles are off by default, irreversible operations ask for confirmation, CSV exports start with the required columns only, and new personal access tokens preselect no scope and expire after 30 days ([#469](https://github.com/SebaSOFT/copalibre/pull/469)).
- **PostgreSQL 18.** The Compose stack runs `postgres:18` on a new volume, `postgresql-data`, mounted at `/var/lib/postgresql`. `copalibre upgrade` moves the 17 data across, checks every table's row count, and removes the 17 volume only after doctor passes ([#427](https://github.com/SebaSOFT/copalibre/pull/427), [#557](https://github.com/SebaSOFT/copalibre/pull/557)).
- **Separate database roles.** The runtime roles connect as `copalibre_app` (rows only) and migrations as `copalibre_owner`; a new `database-setup` role creates both on every Compose start. An external or Kubernetes database must run `deploy/postgres/roles.sql` once before upgrading ([#518](https://github.com/SebaSOFT/copalibre/pull/518)).
- **A strict Content Security Policy on every page**, with no report-only stage. An identity provider on another origin must be declared in `COPALIBRE_CSP_IDENTITY_ORIGIN` ([#511](https://github.com/SebaSOFT/copalibre/pull/511)).
- **`matchNumber` in a player's statistics rows means the match's stage ordinal**, the number the match page shows, instead of its index within a series, and the rows sort by stage and ordinal. A client that joined these rows to a series by `matchNumber` must read the stage ordinal instead.

### Upgrading from 1.x

- From 1.2.5 or 1.2.6: `copalibre upgrade --self`, then `copalibre upgrade`.
- From 1.2.0 or earlier: install the 2.0.0 CLI, then `copalibre upgrade`.
- After an older CLI already ran `copalibre upgrade`: run the 2.0.0 CLI's `copalibre upgrade` again; it repairs the half-upgraded installation.
- The upgrade takes a backup first, replaces an unmodified `docker-compose.yml` (keeping `docker-compose.yml.<version>.bak`), migrates `.env`, moves PostgreSQL 17 to 18 and ends with `copalibre doctor`. A modified Compose file is not touched: the shipped one is written as `docker-compose.yml.new` and the upgrade stops. The move needs free space for a second copy of the database. See the help page "Updating" for rollback before and after the 17 volume is removed.
- Kubernetes: bring your own PostgreSQL 18 or keep yours, run `deploy/postgres/roles.sql`, set both image pins and the new values, and follow `docs/deployment/enterprise-kubernetes.md`. Helm rollback does not undo database migrations.

### Public visitors

- **Live scoreboard and clock.** One scoreboard on the public match page and on TV shows the game clock, which ticks while it runs and holds when it pauses. Tickers and the public live views follow the same clock ([#578](https://github.com/SebaSOFT/copalibre/pull/578)).
- **Competition context.** Match pages, stage headings, match cards and TV headers name the stage, zone and group a match belongs to. Placement labels read within their zone, a drawn knockout shows the side that advances, and TV brackets follow the page language ([#579](https://github.com/SebaSOFT/copalibre/pull/579)).
- **Localized rules and events.** Tiebreak names, event kinds, discipline names and undecided sides on TV follow the page language, with a fallback to the primary language ([#580](https://github.com/SebaSOFT/copalibre/pull/580)).
- **Group standings and progress.** Stage and overview pages show a standings table for each group, with a plan-order column and colored promotion bands. The overview adds tournament progress and overall places ([#581](https://github.com/SebaSOFT/copalibre/pull/581)).
- **Times you can read.** Timestamps say "Yesterday", "Today" or "Tomorrow" in the organization's time zone, and public and TV pages state that zone. A scheduled match still not started 15 minutes after kickoff shows as delayed, and the schedule has a day filter on desktop ([#582](https://github.com/SebaSOFT/copalibre/pull/582)).
- **Player profiles.** A player page shows the shirt number, career totals, each match with its opponent and score, and a link to the club. The player table can be searched and sorted, and the TV ticker names performers ([#583](https://github.com/SebaSOFT/copalibre/pull/583)).
- **Club pages.** Each club in a tournament has a page with its group table, results, squad and knockout path. Team names link to it, and the matches page filters by club ([#588](https://github.com/SebaSOFT/copalibre/pull/588)).
- **Organization club pages.** A club's page lists its titles and podium places, and every published tournament it entered, newest first ([#590](https://github.com/SebaSOFT/copalibre/pull/590)).
- **Standings tie-breaks.** The standings table names the criterion that separated teams level on points. Match cards no longer show a "Decided by" line ([#591](https://github.com/SebaSOFT/copalibre/pull/591)).
- **Public navigation.** Each tournament tab opens its own page and is current only there. A Live tab appears, and the bracket tab opens the first stage that draws one ([#595](https://github.com/SebaSOFT/copalibre/pull/595)).
- **TV status and next match.** TV shows one tournament status (scheduled, live, in progress or finished) and the next match. Standings and match lists page through every row, and multicourt shows one tile per court ([#596](https://github.com/SebaSOFT/copalibre/pull/596)).
- **TV bracket and pinned match.** Bracket crests show a readable monogram when a club has no emblem, and a pinned match keeps its rail on that match ([#597](https://github.com/SebaSOFT/copalibre/pull/597)).
- **Match page timeline, lineups and series games.** The timeline shows who scored, when in the game and the running score, and each played segment opens and closes with its score. Lineups list the registered players before kickoff. Each game of a series has its own page, reached from the bracket ([#604](https://github.com/SebaSOFT/copalibre/pull/604)).
- **Match counters.** Where a discipline declares them, the TV and the public match page show team fouls, timeouts and cards for each side while the game is played. Counters are for display only ([#601](https://github.com/SebaSOFT/copalibre/pull/601)).
- **Phone scoreboard.** On a phone, both sides of the match scoreboard stay on one row, with long team names wrapping within their side ([#603](https://github.com/SebaSOFT/copalibre/pull/603)).
- **Pre-release fixes.** TV refresh keeps matches that are not live, and a match that leaves live drops its live-only figures ([#576](https://github.com/SebaSOFT/copalibre/pull/576)).
- Name a match segment by one word per language across Control, public and TV text, and show the segment in play by its ordinal, with the label in lower case after the ordinal where the language writes it so ([#567](https://github.com/SebaSOFT/copalibre/pull/567), [#568](https://github.com/SebaSOFT/copalibre/pull/568), [#569](https://github.com/SebaSOFT/copalibre/pull/569), [#570](https://github.com/SebaSOFT/copalibre/pull/570)).
- Broadcast screen layouts, TV in the organization's language by default, reduced-motion-safe live cues, and stable hydration ([#466](https://github.com/SebaSOFT/copalibre/pull/466), [#499](https://github.com/SebaSOFT/copalibre/pull/499), [#453](https://github.com/SebaSOFT/copalibre/pull/453), [#517](https://github.com/SebaSOFT/copalibre/pull/517)).
- Keep a pinned or featured scheduled match on screen through the TV's periodic refresh, and show a match that finishes with the score the matches view reports.
- The player dialog shows stored text as text ([#501](https://github.com/SebaSOFT/copalibre/pull/501)).
- Adopt the public tournament layouts, shared page widths and gutters, and the organization screen composed by role ([#476](https://github.com/SebaSOFT/copalibre/pull/476), [#473](https://github.com/SebaSOFT/copalibre/pull/473), [#555](https://github.com/SebaSOFT/copalibre/pull/555)).
- The overview shows the discipline, venues, entrant count and tiebreakers; match cards name their group or round and show a live 0–0; long match lists are grouped by day on phones ([#537](https://github.com/SebaSOFT/copalibre/pull/537), [#532](https://github.com/SebaSOFT/copalibre/pull/532), [#534](https://github.com/SebaSOFT/copalibre/pull/534)).
- Stage match cards show their times in the organization's time zone, and the standings CSV download is served on the application's own origin.
- The player dialog shows statistic labels and competition roles in the page language.
- Responsive data tables, humanized tournament data, clearer hierarchy and filter disclosure ([#485](https://github.com/SebaSOFT/copalibre/pull/485), [#468](https://github.com/SebaSOFT/copalibre/pull/468), [#474](https://github.com/SebaSOFT/copalibre/pull/474)).
- Emblem renditions and a size-scaled emblem frame, with a stored abbreviation as fallback ([#528](https://github.com/SebaSOFT/copalibre/pull/528), [#455](https://github.com/SebaSOFT/copalibre/pull/455)).
- Public performance budgets: the header paints closed, the web role compresses, fonts have metric-matched fallbacks, and a public page paints with its text and heading faces only, adding the other weights after its first paint ([#524](https://github.com/SebaSOFT/copalibre/pull/524), [#527](https://github.com/SebaSOFT/copalibre/pull/527), [#574](https://github.com/SebaSOFT/copalibre/pull/574)).
- The page-not-found composition for deep unknown paths, the page language for undecided sides and column headers, and valid markup semantics ([#535](https://github.com/SebaSOFT/copalibre/pull/535), [#498](https://github.com/SebaSOFT/copalibre/pull/498), [#496](https://github.com/SebaSOFT/copalibre/pull/496), [#481](https://github.com/SebaSOFT/copalibre/pull/481)).
- Shared icons, a validated chart palette, resilient interaction states, a system-aware sunlight theme, a fluid type scale, script font fallbacks, and shared page headers ([#450](https://github.com/SebaSOFT/copalibre/pull/450), [#451](https://github.com/SebaSOFT/copalibre/pull/451), [#452](https://github.com/SebaSOFT/copalibre/pull/452), [#458](https://github.com/SebaSOFT/copalibre/pull/458), [#464](https://github.com/SebaSOFT/copalibre/pull/464), [#454](https://github.com/SebaSOFT/copalibre/pull/454), [#465](https://github.com/SebaSOFT/copalibre/pull/465)).

### Organization administrators

- **Overlay modes.** The TV launcher offers every layout and overlay, and shows and copies the link it builds. The scorebug keeps the corner position inside the broadcast safe area. `mode=overlay-lower` is a lower third on the bottom band, so an existing lower-third source now renders at the bottom, and `mode=overlay-full` is a full-frame scene with the ticker. An overlay with no match paints nothing, and Transparent is the default background for the scorebug and the lower third ([#599](https://github.com/SebaSOFT/copalibre/pull/599)).
- Accept the overlay's chroma colour with or without its leading hash, so a bare hex value typed into an OBS browser source is applied.
- **Club aliases.** Every club carries an alias. The name suggests one when a club is created, and an alias another club holds is refused. Renaming a club's alias keeps its former links working ([#589](https://github.com/SebaSOFT/copalibre/pull/589), [#592](https://github.com/SebaSOFT/copalibre/pull/592)).
- **Stream link.** Each game can carry a stream link, set in the schedule builder.
- Organization aliases that collide with routes are reserved.
- Invitees land on the root landing page, and an invitation submitted before the page hydrates keeps its token ([#516](https://github.com/SebaSOFT/copalibre/pull/516), [#495](https://github.com/SebaSOFT/copalibre/pull/495)).
- Plan a match's segments when it starts, add segments while it is in progress, and offer one clear clock action per segment state; refuse start and resume without a segment, and keep the running clock on Apply clock ([#542](https://github.com/SebaSOFT/copalibre/pull/542), [#561](https://github.com/SebaSOFT/copalibre/pull/561), [#562](https://github.com/SebaSOFT/copalibre/pull/562), [#564](https://github.com/SebaSOFT/copalibre/pull/564)).
- Resolve persisted fixture graphs, placement play and elimination brackets, and name an undecided side by its source on every surface ([#430](https://github.com/SebaSOFT/copalibre/pull/430), [#431](https://github.com/SebaSOFT/copalibre/pull/431), [#434](https://github.com/SebaSOFT/copalibre/pull/434), [#435](https://github.com/SebaSOFT/copalibre/pull/435)).
- Generate a next stage ahead and confirm its qualification ([#436](https://github.com/SebaSOFT/copalibre/pull/436)).
- Schedule integrity with durations, reasons and history; propagate published rescheduling; report conflicts that arise after publication; email the affected people ([#432](https://github.com/SebaSOFT/copalibre/pull/432), [#433](https://github.com/SebaSOFT/copalibre/pull/433), [#437](https://github.com/SebaSOFT/copalibre/pull/437), [#438](https://github.com/SebaSOFT/copalibre/pull/438)).
- Choose a schedule slot by day then time, and open the officials picker one match at a time ([#538](https://github.com/SebaSOFT/copalibre/pull/538), [#539](https://github.com/SebaSOFT/copalibre/pull/539)).
- Control layout foundation, adopted on the setup, operations and administration screens ([#475](https://github.com/SebaSOFT/copalibre/pull/475), [#482](https://github.com/SebaSOFT/copalibre/pull/482), [#483](https://github.com/SebaSOFT/copalibre/pull/483), [#548](https://github.com/SebaSOFT/copalibre/pull/548)).
- One rail entry per screen, a Clubs entry and stage names in breadcrumbs; matches today and the analytics export ([#541](https://github.com/SebaSOFT/copalibre/pull/541), [#549](https://github.com/SebaSOFT/copalibre/pull/549)).
- Name events, formats, tiebreakers and super-admins instead of printing identifiers ([#547](https://github.com/SebaSOFT/copalibre/pull/547)).
- Form controls: fields keep one height and explain long text in a popover, select reads like an input, inputs at 16 px, visible checkbox and radio boxes, padded card headers ([#492](https://github.com/SebaSOFT/copalibre/pull/492), [#489](https://github.com/SebaSOFT/copalibre/pull/489), [#490](https://github.com/SebaSOFT/copalibre/pull/490), [#488](https://github.com/SebaSOFT/copalibre/pull/488), [#491](https://github.com/SebaSOFT/copalibre/pull/491)).
- Accessibility: a skip link, the active language on auth screens, AA contrast for status text, and a correct heading outline ([#500](https://github.com/SebaSOFT/copalibre/pull/500), [#494](https://github.com/SebaSOFT/copalibre/pull/494), [#493](https://github.com/SebaSOFT/copalibre/pull/493), [#543](https://github.com/SebaSOFT/copalibre/pull/543)).
- State expiries as readable dates, and link the product signature and docs to `www.copalibre.app` ([#497](https://github.com/SebaSOFT/copalibre/pull/497), [#429](https://github.com/SebaSOFT/copalibre/pull/429)).

### System administrators

- Upgrade every 1.x installation to 2.0, identifying it by its contents, with a pre-upgrade backup, row-count verification and a release-candidate test from published 1.2.6 and 1.0.5 images.
- `copalibre doctor` configures the settings an installation is missing ([#558](https://github.com/SebaSOFT/copalibre/pull/558)); `start` and `restart` work on a fresh install and after `stop`, and Mailgun delivers under Compose without an explicit region; the tournament overview meets its paint budget ([#559](https://github.com/SebaSOFT/copalibre/pull/559), [#522](https://github.com/SebaSOFT/copalibre/pull/522)).
- Grant the first super-admin from the host, only while none is active ([#551](https://github.com/SebaSOFT/copalibre/pull/551)).
- Remove single-run containers once the stack is up ([#556](https://github.com/SebaSOFT/copalibre/pull/556)).
- Before it stops anything, the upgrade measures the database and the free space beside its PostgreSQL volume, and refuses the move, changing nothing, when Docker's disk holds less than twice the database ([#571](https://github.com/SebaSOFT/copalibre/pull/571), [#573](https://github.com/SebaSOFT/copalibre/pull/573)).
- Let operators publish their own `/.well-known/` files ([#508](https://github.com/SebaSOFT/copalibre/pull/508)).
- Serve the fonts from the application origin ([#509](https://github.com/SebaSOFT/copalibre/pull/509)).
- The CLI binary loads `sharp` only when it makes a rendition, so it starts on every platform ([#552](https://github.com/SebaSOFT/copalibre/pull/552)).
- Security release gate: static checks and a Git-history secret scan run before any image is published, with fixes for the findings it reproduced ([#515](https://github.com/SebaSOFT/copalibre/pull/515)).
- Harden native authentication and the development stack ([#449](https://github.com/SebaSOFT/copalibre/pull/449)).
- The events service verifies native sessions against the API's key set, so Control's live stream accepts them beside an external provider ([#523](https://github.com/SebaSOFT/copalibre/pull/523)).
- `copalibre doctor` warns about each organization whose stored time zone the runtime does not know, and names it. The warning does not stop `copalibre start` ([#607](https://github.com/SebaSOFT/copalibre/pull/607)).
- Upgrading gives every club without an alias, or with a UUID as its alias, a suggested alias before the alias becomes required. The migration writes no audit event and no redirect ([#594](https://github.com/SebaSOFT/copalibre/pull/594)).

### Integrators

- Package the MCP server as an MCPB bundle, attached to each release and published to Smithery ([#457](https://github.com/SebaSOFT/copalibre/pull/457)).
- Restore the interactive API reference at `/help/api-reference/`, with Try It authenticated by a personal access token ([#550](https://github.com/SebaSOFT/copalibre/pull/550)).
- Commit each console command's idempotency key with its writes, and read an event's sequence inside its own transaction ([#565](https://github.com/SebaSOFT/copalibre/pull/565), [#566](https://github.com/SebaSOFT/copalibre/pull/566)).
- Personal access tokens load from the path the API serves ([#487](https://github.com/SebaSOFT/copalibre/pull/487)).
- Public match responses carry a `clock` snapshot (segment, elapsed seconds, whether it runs and when it was taken). The realtime `match.clock-changed` event carries the same clock, and tournament listings include `liveMatches`.
- Match and bracket responses name the stage, zone and group of a match, and a finalized match names its `winnerEntrantId`.
- Finalized matches separated by a tiebreak carry `decidingFactorCode` and `decidingFactorRule`, and match events carry `definitionCode` and localized `labels`.
- The overview's standings preview uses the public table's ranking, with group-relative ranks and group names.
- Person responses carry `shirtNumber` and `clubAlias`.
- Club responses require `alias`, and the tournament overview lists `formerAliases`. A club create or update that reuses another club's alias answers `409 club-conflict`, where it answered 500. `GET /api/organizations/{organizationAlias}/public/clubs/{clubAlias}` returns an organization club page.
- An organization's time zone must be one the runtime knows; the API answers 400 for any other.
- Modules declare `matchCounters`: a code, a label, a short label of up to three characters, the events they count, a scope of `match` or `segment`, and an optional allowance and warning threshold. Existing modules validate unchanged.

### Contributors

- Prepare the 2.0.0 release: version pins and the first release notes ([#575](https://github.com/SebaSOFT/copalibre/pull/575)).
- AGENTS.md lists every local gate for a change, requires a help claim for each new capability, and makes OpenSpec, rtk, CodeGraph and the communication rules mandatory ([#593](https://github.com/SebaSOFT/copalibre/pull/593), [#600](https://github.com/SebaSOFT/copalibre/pull/600)).
- The release gate no longer requires a manual screen-reader pass; the checklist is optional ([#602](https://github.com/SebaSOFT/copalibre/pull/602)).
- Test titles name behavior without planning task numbers ([#598](https://github.com/SebaSOFT/copalibre/pull/598)).
- Large source files are split by responsibility, and a file-size check requires a recorded decision for any file over its limit ([#605](https://github.com/SebaSOFT/copalibre/pull/605)).
- Lower the public LCP budget to 2200 ms ([#577](https://github.com/SebaSOFT/copalibre/pull/577)).
- Demo loads anchored to a date and played up to a cutoff ([#439](https://github.com/SebaSOFT/copalibre/pull/439)).
- Codify the design review contract and complete the closing design review ([#448](https://github.com/SebaSOFT/copalibre/pull/448), [#486](https://github.com/SebaSOFT/copalibre/pull/486), [#470](https://github.com/SebaSOFT/copalibre/pull/470), [#553](https://github.com/SebaSOFT/copalibre/pull/553)).
- One interface copy voice, enforced in contribution review ([#456](https://github.com/SebaSOFT/copalibre/pull/456), [#467](https://github.com/SebaSOFT/copalibre/pull/467)).
- Performance and kiosk release gates, run in their own job against the shipped path ([#472](https://github.com/SebaSOFT/copalibre/pull/472), [#519](https://github.com/SebaSOFT/copalibre/pull/519), [#520](https://github.com/SebaSOFT/copalibre/pull/520), [#521](https://github.com/SebaSOFT/copalibre/pull/521), [#525](https://github.com/SebaSOFT/copalibre/pull/525)).
- Dependency refresh and advisory remediation: Dependabot batches, library updates, `astro`, `@astrojs/node`, `hono`, `@hono/node-server`, `basic-ftp`, `image-size` and `onnxruntime-web` raised or pinned for their advisories, with the remediations recorded ([#420](https://github.com/SebaSOFT/copalibre/pull/420), [#424](https://github.com/SebaSOFT/copalibre/pull/424), [#425](https://github.com/SebaSOFT/copalibre/pull/425), [#426](https://github.com/SebaSOFT/copalibre/pull/426), [#446](https://github.com/SebaSOFT/copalibre/pull/446), [#512](https://github.com/SebaSOFT/copalibre/pull/512), [#514](https://github.com/SebaSOFT/copalibre/pull/514), [#529](https://github.com/SebaSOFT/copalibre/pull/529), [#530](https://github.com/SebaSOFT/copalibre/pull/530), [#531](https://github.com/SebaSOFT/copalibre/pull/531), [#533](https://github.com/SebaSOFT/copalibre/pull/533), [#536](https://github.com/SebaSOFT/copalibre/pull/536), [#540](https://github.com/SebaSOFT/copalibre/pull/540), [#546](https://github.com/SebaSOFT/copalibre/pull/546)).
- Test reliability: a faster integration suite sharing the demo load, clone tests with a realistic timeout, and four e2e tests that no longer fail on clean code ([#563](https://github.com/SebaSOFT/copalibre/pull/563), [#484](https://github.com/SebaSOFT/copalibre/pull/484), [#502](https://github.com/SebaSOFT/copalibre/pull/502)).
- The CLI build check runs when a workspace package changes; the accepted specs validate with OpenSpec 2.0.0 ([#554](https://github.com/SebaSOFT/copalibre/pull/554), [#560](https://github.com/SebaSOFT/copalibre/pull/560), [#440](https://github.com/SebaSOFT/copalibre/pull/440)).
- Contributor documentation: the release procedure, delivery lessons, tooling reference and proposal rules; an operator research kit; screenshots are attached to pull requests instead of committed ([#419](https://github.com/SebaSOFT/copalibre/pull/419), [#526](https://github.com/SebaSOFT/copalibre/pull/526), [#428](https://github.com/SebaSOFT/copalibre/pull/428), [#447](https://github.com/SebaSOFT/copalibre/pull/447), [#471](https://github.com/SebaSOFT/copalibre/pull/471), [#510](https://github.com/SebaSOFT/copalibre/pull/510), [#572](https://github.com/SebaSOFT/copalibre/pull/572)).

### Deprecations

- The `decidingFactor` field on match responses is deprecated. Read `decidingFactorCode` and `decidingFactorRule` instead.
- `streamUrl` on a fixture is deprecated: it repeats the first game's link. Read `matches[].streamUrl` for every game.

## [1.2.6](https://github.com/SebaSOFT/copalibre/compare/v1.2.5...v1.2.6) (2026-10-09)

### Infrastructure and supply chain

- Repair the TV soak-test pipeline and build its web dependencies before execution ([737a3082](https://github.com/SebaSOFT/copalibre/commit/737a3082)).
- Gate releases on Dependabot advisories, absorb verified updates, paginate alert queries, restore the audit gate, grant the required read access, and clear resulting advisories ([b2c44436](https://github.com/SebaSOFT/copalibre/commit/b2c44436), [bb1f14ad](https://github.com/SebaSOFT/copalibre/commit/bb1f14ad), [3c470956](https://github.com/SebaSOFT/copalibre/commit/3c470956), [b2a361f9](https://github.com/SebaSOFT/copalibre/commit/b2a361f9), [eceaae79](https://github.com/SebaSOFT/copalibre/commit/eceaae79), [7f812569](https://github.com/SebaSOFT/copalibre/commit/7f812569)).
- Upgrade the NestJS services to Nest 12 and move the API's unit and integration tests to Vitest, with an install-time guard that keeps the NestJS major versions aligned; API contracts and rate-limit behavior are unchanged ([#385](https://github.com/SebaSOFT/copalibre/pull/385)).
- Report confirmed transitive dependency security remediations from a versioned register, grouped by direct dependency root, in the CI summary ([#387](https://github.com/SebaSOFT/copalibre/pull/387)).
- Make test runs trustworthy under load: a timeout a workspace declares now applies when integration tests run from the root, suites that clone the module repository skip with a stated reason when it is unreachable and fail in CI, end-to-end mock ports no longer collide with the development stack, rescued retries are listed as flaky in each job summary, and the module distribution integration suites now run in CI ([#394](https://github.com/SebaSOFT/copalibre/pull/394)).
- Keep tracked content free of references to ignored planning artifacts, and fail CI when one reappears ([#392](https://github.com/SebaSOFT/copalibre/pull/392), [#393](https://github.com/SebaSOFT/copalibre/pull/393)).

### Self-hosted CLI

- Reconcile application upgrades and validate host environment with `doctor` ([d4958b78](https://github.com/SebaSOFT/copalibre/commit/d4958b78)).
- Repair `init` installations, configure email, and add process lifecycle commands for stop, restart, and status ([ab7d72af](https://github.com/SebaSOFT/copalibre/commit/ab7d72af), [ab65f0e2](https://github.com/SebaSOFT/copalibre/commit/ab65f0e2)).
- Remove the unused bulk personal-access-token cutover command; active tokens stay valid until they expire or their owner revokes them ([#384](https://github.com/SebaSOFT/copalibre/pull/384)).
- Load the committed Panamericano demo tournament, with its clubs, emblems, schedule and results, into a running development stack with `copalibre dev demo` ([#386](https://github.com/SebaSOFT/copalibre/pull/386)).
- Report a module's images stored under another object-storage profile than the active one, or missing: `module verify` fails naming both profiles, `copalibre doctor` warns with a new `warn` status, and the API logs once per key when a referenced background cannot be served ([#411](https://github.com/SebaSOFT/copalibre/pull/411)).

### Public and control experience

- Fix localized home routing and language switching across public pages ([ff35ce1d](https://github.com/SebaSOFT/copalibre/commit/ff35ce1d), [f812f2bc](https://github.com/SebaSOFT/copalibre/commit/f812f2bc), [eb960bc2](https://github.com/SebaSOFT/copalibre/commit/eb960bc2)).
- Refine organization dashboard hierarchy, role terminology, and reverse-proxy help; separate operator documentation from public navigation ([0c0423ea](https://github.com/SebaSOFT/copalibre/commit/0c0423ea), [7939ff30](https://github.com/SebaSOFT/copalibre/commit/7939ff30)).
- Serve the discipline backdrop and the TV emblems from the web origin ([#399](https://github.com/SebaSOFT/copalibre/pull/399)).
- Draw one fixed, faint (6 %), blurred discipline backdrop behind the whole public page instead of a second full-strength copy in the tournament hero ([#412](https://github.com/SebaSOFT/copalibre/pull/412)).
- Keep organization listing cards legible at any width ([#401](https://github.com/SebaSOFT/copalibre/pull/401)).
- Show the match report in the page's language, on the shared width and panel ([#402](https://github.com/SebaSOFT/copalibre/pull/402)).
- Add a localized breadcrumb to every public page below the organization ([#403](https://github.com/SebaSOFT/copalibre/pull/403)).
- Explain table columns, filter in place and offer compact club chips ([#404](https://github.com/SebaSOFT/copalibre/pull/404)).
- Show progress per stage and zone, list the rules in force, and warn only when the viewer is offline ([#405](https://github.com/SebaSOFT/copalibre/pull/405)).
- Draw the knockout bracket with its links and its placement games, with a winner and an elimination shown by weight, and a compact card on phones ([#406](https://github.com/SebaSOFT/copalibre/pull/406)).
- Present the match schedule as tables grouped by stage and round ([#407](https://github.com/SebaSOFT/copalibre/pull/407)).
- Resolve and show the champions of every zone of the last stage ([#400](https://github.com/SebaSOFT/copalibre/pull/400)).

### Tournament authoring

- Add adaptive stage previews, configurable group allocation, and a visual WHEN/THEN rules editor ([405967c4](https://github.com/SebaSOFT/copalibre/commit/405967c4)).
- Let a zone play its own format, inherited from its stage when it declares none, so one stage can hold a league zone beside knockout zones ([#390](https://github.com/SebaSOFT/copalibre/pull/390)).
- Declare a tournament's zones, their formats and series in the setup wizard and review them, with each zone's effective format, before creating the tournament ([#391](https://github.com/SebaSOFT/copalibre/pull/391)).
- Generate the next round of a Swiss or single-elimination stage one zone at a time: pairings, round numbers and results are per zone and a zone never pairs entrants of another. A stage with several zones now requires `zoneNumber` on the request, and the stage hub offers a "Generate next round" action for every eligible zone ([#395](https://github.com/SebaSOFT/copalibre/pull/395)).

### TV broadcast

- Add the `/tv` launcher, display shortcuts, and direct navigation to tournament broadcasts ([0fdbc730](https://github.com/SebaSOFT/copalibre/commit/0fdbc730), [22dec1a0](https://github.com/SebaSOFT/copalibre/commit/22dec1a0)).
- Present each zone of a mixed-format stage by the format it plays: one standings table per zone under the zone's name, the bracket for knockout zones, and a fixtures view grouped by round for league zones, reachable with `?view=fixtures` ([#396](https://github.com/SebaSOFT/copalibre/pull/396)).
- Give the kiosk its own identity and dates in the organization's time zone, a match list view, stage and pinned-match views, stacked layouts on phones, and a paging that always cycles ([#408](https://github.com/SebaSOFT/copalibre/pull/408)).
- Correct the launcher's language, stages and overlay match, add a "TV Streaming" link to the public main menu, and let overlays follow a court ([#409](https://github.com/SebaSOFT/copalibre/pull/409)).
- Make the overlay show only the match it was given, with the series' pips and standing, the sets played and the segment in play named by its place ("2nd Half", "3rd Set"), in the viewer's language; the lower third keeps two rows on a phone-shaped frame ([#410](https://github.com/SebaSOFT/copalibre/pull/410)).

### Email notifications

- Send lifecycle emails to the roles that act on them (new tournament, new club, new registration, submitted squad), in the organization's language with its emblem and name, at most once per recipient ([#389](https://github.com/SebaSOFT/copalibre/pull/389)).
- Count every email delivery attempt by outcome and return the counts under `emailDelivery` in the worker's `/jobs/metrics`, so an operator can alert on a recipient who may have missed an email; log each unknown outcome as one structured line without the recipient's address ([#397](https://github.com/SebaSOFT/copalibre/pull/397)).

## [1.2.5](https://github.com/SebaSOFT/copalibre/compare/v1.2.1...v1.2.5) (2026-10-03)

### Features

- **cli:** dynamic help column alignment, deduplicate interactive version, and cyan ascii logo ([b62bfe7](https://github.com/SebaSOFT/copalibre/commit/b62bfe72b3806950ee064ae067b57b1cb4172f3d))
- **cli:** prompt upgrade on existing installation and detect stack version disparity ([2786d1d](https://github.com/SebaSOFT/copalibre/commit/2786d1dd53a1523d4090bf35c5c3a4f6be570da2))
- **cli:** add upgrade lifecycle management and module update check ([cb351de](https://github.com/SebaSOFT/copalibre/commit/cb351de753239a5fefc58bb7dc05f42fb6e49221))
- **cli:** harden reverse proxy template with SSE keep-alive, upload streaming, and wizard prompt ([321d02a](https://github.com/SebaSOFT/copalibre/commit/321d02afabda15f3408bfdcab15ae6292376fb68))
- **cli:** add host preflight, onboarding wizard, and proxy export ([bf8db7b](https://github.com/SebaSOFT/copalibre/commit/bf8db7b78996bdfef51421683ec10c0e782ee81f))
- **web:** invite public home experience and refine header layout ([d127210](https://github.com/SebaSOFT/copalibre/commit/d127210a473ee16ba5863378415d85feebce53fb))

### Bug Fixes

- **cli:** advisory ignores, non-blocking preflight in init, and binary parity secret normalization ([266651f](https://github.com/SebaSOFT/copalibre/commit/266651ff2c68a442e9d2906bbbfefdf586d38e89))
- **deploy:** route bare API endpoints and subpaths through gateway ([5917b62](https://github.com/SebaSOFT/copalibre/commit/5917b62372f8541e4c3b5bc1a5ee7265be7fef00))
- **deps:** remove obsolete @ai-sdk/provider-utils resolution and guard ([69e012c](https://github.com/SebaSOFT/copalibre/commit/69e012c1b2c451da7787fb9d663efd85d7742d13))
- **web:** use declared --cl-border-muted token in spectator notice ([2527c79](https://github.com/SebaSOFT/copalibre/commit/2527c797634bdf26046e32c3b28ca4ef4b4eafe6))

## [1.2.1](https://github.com/SebaSOFT/copalibre/compare/v1.2.0...v1.2.1) (2026-10-01)

### Features

- **web:** add versioned image cache-busting and optimistic preview ([9c114f0](https://github.com/SebaSOFT/copalibre/commit/9c114f0d9314ed9effa6ff3aa33ba8bbecf3afc0))
- **web:** client-side image cutout and emblem display ([d0422af](https://github.com/SebaSOFT/copalibre/commit/d0422af947726a0b7d44732c1e7c296038740de4))
- **web:** improve screen hierarchy and actionable alerts ([1fdfc61](https://github.com/SebaSOFT/copalibre/commit/1fdfc61bc75ae08964bb46b82bb3e8e6eced34d8))

### Bug Fixes

- **deps:** cover remaining Dependabot updates ([17a3aa2](https://github.com/SebaSOFT/copalibre/commit/17a3aa2dc5b0bfc43f67d35d3368954f8cc34f3c))
- **deps:** enforce workspace-wide security audit ([7c9f718](https://github.com/SebaSOFT/copalibre/commit/7c9f7181f02f1992a1c4b3439bcebd47d06a403b))
- **deps:** refresh security advisory floors ([d77506d](https://github.com/SebaSOFT/copalibre/commit/d77506dd78e7ba1f1ca96541ff3fce9d8aacfe99))
- **deps:** resolve @nestjs/platform-fastify GHSA-9c5c-9qcx-q35q audit advisory ([0045807](https://github.com/SebaSOFT/copalibre/commit/004580758edde30e83c1ae98dacfab20c34ab004))
- **deps:** resolve js-yaml security audit ([c5951ef](https://github.com/SebaSOFT/copalibre/commit/c5951efb5167b4f15ebf66844dc9dca55b62e5d4))
- **web:** clarify info and live alert colors ([5024ee5](https://github.com/SebaSOFT/copalibre/commit/5024ee53db58704d6697eb8a41ede0ed7d18c2d7))
- **web:** keep static control redirect same-origin ([6276b8d](https://github.com/SebaSOFT/copalibre/commit/6276b8d769a759a4c88f3ece076ed264872e9704))
- **web:** localize static control redirect title ([00ef22d](https://github.com/SebaSOFT/copalibre/commit/00ef22d3d8ebd113cafce2556b2a3e43728b4322))
- **web:** preserve canonical caching and fix CI test suites ([760b01d](https://github.com/SebaSOFT/copalibre/commit/760b01d2de8312ab1571afd51a5d08d0a54c8a9a))

## [1.2.0](https://github.com/SebaSOFT/copalibre/compare/v1.1.0...v1.2.0) (2026-09-28)

### Features

- **api,web:** add Club Portal self-service member directory and roster submission ([4b6cd86](https://github.com/SebaSOFT/copalibre/commit/4b6cd86c472ae2969ffb1cb726206ebc356cea26))
- **api,web:** silent session renewal for native and OIDC control-web logins ([ff532bd](https://github.com/SebaSOFT/copalibre/commit/ff532bdd7de332fef991996a4e8dcf3b825c97a7))
- **api:** add a tournament stage-list read endpoint ([92378e5](https://github.com/SebaSOFT/copalibre/commit/92378e53748ec5a2e746974885db0e9915fd6423))
- **api:** add entrant-attribute-keys endpoint, fix test fixtures, regen contracts ([f974fc5](https://github.com/SebaSOFT/copalibre/commit/f974fc537b1b4103b8f3e100a49cbd22bed9fa72))
- **api:** add player statistics drilldown read and public endpoint ([284b043](https://github.com/SebaSOFT/copalibre/commit/284b0434f771e4c6c0495d42e419cdd1bead1dd7))
- **api:** expose a stage's discipline-declared formats and descriptions ([f1c3952](https://github.com/SebaSOFT/copalibre/commit/f1c39522c913b41c3d0764ce3d3437b92203721f))
- **api:** expose installed discipline documents and ruleset field policies ([67d692e](https://github.com/SebaSOFT/copalibre/commit/67d692e54cc37571c00f8558bd84c5ef6a9e5699))
- **api:** expose stage seeding allocation end-to-end ([a1a014d](https://github.com/SebaSOFT/copalibre/commit/a1a014d1dd148ac38620ff4a6735e54f621cf695))
- **api:** populate series progress in bracket match projections ([7e4f2d7](https://github.com/SebaSOFT/copalibre/commit/7e4f2d76ae0e22d9e1b36deff8a58e4663952289))
- **ci:** add Dependabot for npm, GitHub Actions, and Docker ([604e3be](https://github.com/SebaSOFT/copalibre/commit/604e3be4c82304668965bce8fdec1e4110f73cc2))
- **ci:** render the CRAP-score report on every PR's Job Summary (openspec 0234) ([049b740](https://github.com/SebaSOFT/copalibre/commit/049b740339e261f1879bcb77ee4ca65d16be8d5d))
- **cli:** add MCP tools for module add/remove/verify, statistics-rebuild, backup ([06a697b](https://github.com/SebaSOFT/copalibre/commit/06a697b3f8e06503fd45648266a6eaaf4689ff2f))
- **cli:** add MCP tools for tournament-profile authoring parity ([1e60d68](https://github.com/SebaSOFT/copalibre/commit/1e60d68cdd5f0c7ed7d833663cee6c96ea22aa45))
- **cli:** add organization/tournament operational commands ([47aff73](https://github.com/SebaSOFT/copalibre/commit/47aff731b06f9e7037db018a8551127d01e43d2f))
- **contracts:** update openapi schema and types for series in bracket matches ([e19a8f0](https://github.com/SebaSOFT/copalibre/commit/e19a8f0cd814b688588543c8e00c952122877ece))
- **control-web,api:** link bracket canvas nodes to a match's control screen ([cfc5c23](https://github.com/SebaSOFT/copalibre/commit/cfc5c230e34bf5d627fd0e1ccf323c4b87eb38eb))
- **control-web,public-web,api:** plain-language tournament summary (openspec 0267) ([67ac053](https://github.com/SebaSOFT/copalibre/commit/67ac0530c1fbd181bc4a8cb552f475cdc08acd1a))
- **control-web:** add live bracket structure preview to tournament wizard ([b3f9715](https://github.com/SebaSOFT/copalibre/commit/b3f97153de8ed281f9cd468564b4ec913557cedc))
- **control-web:** condensed per-role hint text and a shared help-URL helper ([0fc472a](https://github.com/SebaSOFT/copalibre/commit/0fc472a329678d375da36028fadaad3749996652))
- **control-web:** explain the selected role in both role pickers ([212413f](https://github.com/SebaSOFT/copalibre/commit/212413fcbb098bf970c9a7769a0c2698dd1d8cb7))
- **control-web:** guided format selection on the Stage hub ([91a6704](https://github.com/SebaSOFT/copalibre/commit/91a6704d08bd4fc510090abec1d09a8496fc1da4))
- **control-web:** multi-stage authoring in TournamentSetupWizard ([cb0cad2](https://github.com/SebaSOFT/copalibre/commit/cb0cad2ca8dee7d24a23e354794682d98371ae9a))
- **control-web:** offer discipline ruleset overrides during tournament creation ([00d5890](https://github.com/SebaSOFT/copalibre/commit/00d5890ab3a2ce5a29cbe98f9a76d5b8ff2dc487))
- **control-web:** reuse the shared stage editor in ProfileBuilderWizard ([820cc92](https://github.com/SebaSOFT/copalibre/commit/820cc9254a9c87318696ba350903f5c892f2a157))
- **control:** add super-admin platform diagnostics and outbox remediation ([ca86f9b](https://github.com/SebaSOFT/copalibre/commit/ca86f9b30a6706b3f0d0781f81b9ad50490fdb34))
- **control:** align resources action layout, official badges, and ui ownership [0287] ([c1792ab](https://github.com/SebaSOFT/copalibre/commit/c1792abef82d9e783bbffb6cc7e7a4d85cc06e52))
- **control:** resolve audit trail actors, localize actions and reasons, format diffs [0289] ([2957d65](https://github.com/SebaSOFT/copalibre/commit/2957d65bac8812580d2a8699d82bcbddcb356f3c))
- **control:** show assigned group entrants and resolve ui ownership [0283] ([a0cfbac](https://github.com/SebaSOFT/copalibre/commit/a0cfbacfa65e98b61d7c228ad618983a8dba9fbb))
- **copalibre:** copalibre doctor data-integrity diagnostics and --fix repair ([3787d03](https://github.com/SebaSOFT/copalibre/commit/3787d03e9461656199eab4004ad5e5435f9209b0))
- **deploy:** default nginx ingress to unbuffered SSE responses ([c67fd4b](https://github.com/SebaSOFT/copalibre/commit/c67fd4b308f4824792ded1a45ce93f8925431ce0))
- **deploy:** replace MinIO with Garage for self-hosted object storage ([69600ea](https://github.com/SebaSOFT/copalibre/commit/69600ea9aee2a20eb251766bbafd39ee79ec0825))
- **design-tokens:** add compact/sticky table and tooltip tokens ([4c9361d](https://github.com/SebaSOFT/copalibre/commit/4c9361d2790bde645c759a122cbb4043f84bc55d))
- **domain:** add optional label/description to FieldPolicy ([1932042](https://github.com/SebaSOFT/copalibre/commit/1932042588008f00c43eba5bb4de4ded4f5f7f0f))
- **domain:** add per-stage seeding allocation to tournament profiles ([40d8db9](https://github.com/SebaSOFT/copalibre/commit/40d8db95856f1a4fc9404893cf9876987587cea8))
- **domain:** export mergeWithStrategy ([ba6c9a6](https://github.com/SebaSOFT/copalibre/commit/ba6c9a60f4e79cf068b9ab6e9822d1bd46fa6472))
- **public-web,control-web,api:** show where a match sits in its bracket ([e80254c](https://github.com/SebaSOFT/copalibre/commit/e80254cbb54d58ebb176ae320e6af7c8ee026c08))
- **public-web:** expose zero display metadata ([7f2c01e](https://github.com/SebaSOFT/copalibre/commit/7f2c01e71119011bc3039c542381de305f5c793b))
- **public-web:** support configurable player statistics ([0e92c28](https://github.com/SebaSOFT/copalibre/commit/0e92c280bbd711b80eadbb5445caaf240d191a26))
- **routing:** add the discipline-document control-panel route ([ca0a43c](https://github.com/SebaSOFT/copalibre/commit/ca0a43cc2957f691b2d5f6376755dcb1369645af))
- **rules,control-web:** render configured hook-script rules in plain language ([7afa111](https://github.com/SebaSOFT/copalibre/commit/7afa1119e850390977ddafe0020e748450e252c0))
- **tournament:** add completion overview across public and control surfaces ([c57c8af](https://github.com/SebaSOFT/copalibre/commit/c57c8af0ca0c5587e56f12b340a2d170a55f6041))
- **web,api:** TV broadcast possession/penalty indicators and bracket rail ([20c9a45](https://github.com/SebaSOFT/copalibre/commit/20c9a45c2077070e71226e09ad86c3f6b1f759aa))
- **web:** add an installed discipline's detail view to platform administration ([56dd9b8](https://github.com/SebaSOFT/copalibre/commit/56dd9b8b468282c38777a7471a4ebcdb6f8696eb))
- **web:** add Broadcaster Studio self-service console and live overlay event alerts ([c020bc6](https://github.com/SebaSOFT/copalibre/commit/c020bc655ed6e635b7e394aece8a10e5494188f8))
- **web:** add ColumnHeaderTooltip atom for described, sortable headers ([370aeb8](https://github.com/SebaSOFT/copalibre/commit/370aeb86291c536b689263229da473d50d60545c))
- **web:** add compact ticker presentation to MatchCard and the public matches view ([7c23d26](https://github.com/SebaSOFT/copalibre/commit/7c23d26d2be45844b35ebb6a0c8690e6c25f6b7c))
- **web:** add LocalizedInput atom for multi-language text fields (openspec 0233) ([e9a25c8](https://github.com/SebaSOFT/copalibre/commit/e9a25c89e73f3b4ee839d8207be5e22495cb9682))
- **web:** add pinned-match TV event ticker and fix its missing standings ([aa2830d](https://github.com/SebaSOFT/copalibre/commit/aa2830d03d35c10560582fe635459ba2dd9893e4))
- **web:** add ResponsiveTimestamp/ResponsivePlayerName atoms, adopt EntrantName on TV surfaces ([8a7b174](https://github.com/SebaSOFT/copalibre/commit/8a7b17424095799fd2aacef7de752c8d6d566e2c))
- **web:** add the shared discipline plain-language summary component ([87d31fb](https://github.com/SebaSOFT/copalibre/commit/87d31fbc35def5567537eef6587e0f3aea278c8f))
- **web:** add Tournament and Stage hub screens ([31573b7](https://github.com/SebaSOFT/copalibre/commit/31573b7573fbf39fad1eff37c0113e003abef519))
- **web:** add tournament-creation entry point to the control dashboard ([5e8e978](https://github.com/SebaSOFT/copalibre/commit/5e8e9781f62f5562b9bc47617a57bc4bddb5ea76))
- **web:** add typed ruleset-field controls and fix merge-aware value display ([5e13c4e](https://github.com/SebaSOFT/copalibre/commit/5e13c4e3ef568784dccb0c9fca7ac77bc4081e15))
- **web:** adopt LocalizedInput/LocalizedTextarea in the two authoring wizards (openspec 0233) ([84b09d1](https://github.com/SebaSOFT/copalibre/commit/84b09d1ea1391bc393cd6f5c2505f3df4ab52471))
- **web:** adopt ResponsiveTimestamp/ResponsivePlayerName on public and control surfaces ([3ace249](https://github.com/SebaSOFT/copalibre/commit/3ace249259481fcec0666439c0bf281e4ae67949))
- **web:** align public tournament figures and match bands ([981c22b](https://github.com/SebaSOFT/copalibre/commit/981c22b8189b6be57533f8eedb9b5b1fc6d1bc38))
- **web:** align the public 404 page with the Broadcast Command Precision design system ([0ff5849](https://github.com/SebaSOFT/copalibre/commit/0ff584927a1c9da801bc5deb6fa74a144b9e42c3))
- **web:** complete multi-zone overview podium ([c13e886](https://github.com/SebaSOFT/copalibre/commit/c13e886b42a2f0fbc413e0c9e9373633643ee24a))
- **web:** compose public live dashboard with owned surfaces ([978ded6](https://github.com/SebaSOFT/copalibre/commit/978ded64834c426ff42a870cc6346211ebc8cf78))
- **web:** consolidate the match schedule into one hierarchical filter bar ([d159c96](https://github.com/SebaSOFT/copalibre/commit/d159c967d7d7efc04f6a09a499ce1a04405afd15))
- **web:** cross-link the dashboard and stage-scoped screens to the new hubs ([fad35de](https://github.com/SebaSOFT/copalibre/commit/fad35de02a22d5903274149cd8d44587ad90290d))
- **web:** custom chamfered dropdown for the Select atom (openspec 0295) ([939601c](https://github.com/SebaSOFT/copalibre/commit/939601cab54f92f8e826d8600472f0fd1b985315))
- **web:** display compact series progress on operator bracket canvas ([f10db9e](https://github.com/SebaSOFT/copalibre/commit/f10db9ebe8a0b47abdb771a8c39be921d618b95b))
- **web:** display tournament co-champions ([ed38cb4](https://github.com/SebaSOFT/copalibre/commit/ed38cb4d0273baec47feba4ae480501670fc431c))
- **web:** expand analytics tournament overview ([5dbaca7](https://github.com/SebaSOFT/copalibre/commit/5dbaca728bb4672edd4bbef87dc4fb9289818d5d))
- **web:** extend StandingsPanel with the canonical table's chrome ([141137a](https://github.com/SebaSOFT/copalibre/commit/141137a25e836a7bb1ae3c069b3684ce48cc3340))
- **web:** generalize column sort to tri-state (desc/asc/none) ([e33d7cc](https://github.com/SebaSOFT/copalibre/commit/e33d7ccfd3962b2ee853f159dda53e3ff5c3a324))
- **web:** give the tournament hero a discipline backdrop and fix progress spacing ([e6ba985](https://github.com/SebaSOFT/copalibre/commit/e6ba985154ac4b48fa89ece72d5dba7e39139ee9))
- **web:** highlight entrant journeys through brackets ([45e4e01](https://github.com/SebaSOFT/copalibre/commit/45e4e01cc6bf68521f09be8da90bac67af3d8cff))
- **web:** live-patch the public tournament score ticker via SSE ([3156c08](https://github.com/SebaSOFT/copalibre/commit/3156c0818222337351f13bf3ade79d3ea57ba2a5))
- **web:** localize dashboard activity feed and adopt Badge/empty-state atoms ([ae2984f](https://github.com/SebaSOFT/copalibre/commit/ae2984fca8de3439dbd11c8c057199d2af2c4385))
- **web:** localize match report sections and humanize timestamps ([271cad8](https://github.com/SebaSOFT/copalibre/commit/271cad8ae2eb30023af04a57703b53558201e3a1))
- **web:** localize organization preferences ([66cf989](https://github.com/SebaSOFT/copalibre/commit/66cf989725792aa9b7a2919f55ecb710d8e30109))
- **web:** localize StandingsTable's player dialog and profile breadcrumb ([0a6ea78](https://github.com/SebaSOFT/copalibre/commit/0a6ea787385db80b67facb787dace84ce2455399))
- **web:** multi-court grid presentation on the TV kiosk route ([273051e](https://github.com/SebaSOFT/copalibre/commit/273051edfd1f6c066de1eb6a9c64f5cff7c2a1b1))
- **web:** opt-in compact density, sticky header, and aria-sort on DataTable ([77ad41d](https://github.com/SebaSOFT/copalibre/commit/77ad41dcd3a6c95a2ce362bd85d84af4593602cf))
- **web:** refine tournament wizard progress ([8ed32f4](https://github.com/SebaSOFT/copalibre/commit/8ed32f4c6e1ebca24bafb82bfb6dedbb03d92949))
- **web:** render player tournament and match-by-match statistics ([ec7a38a](https://github.com/SebaSOFT/copalibre/commit/ec7a38a9605227f3818beab352cb51510d6663e1))
- **web:** resolve entrant names in seeding builder and align ui ownership [0282] ([6f8f58c](https://github.com/SebaSOFT/copalibre/commit/6f8f58c9e563ad3d69713ead39ab1c2b3b84dda6))
- **web:** show the plain-language summary in the wizard and ruleset editor ([853143b](https://github.com/SebaSOFT/copalibre/commit/853143b95fb03ac0e6401d16848e5948e2080373))
- **web:** split LocalizedInput's tabs into a shared atom, add LocalizedTextarea (openspec 0233) ([1262433](https://github.com/SebaSOFT/copalibre/commit/12624338ade2a179644d9ef33d15b5b58d4b3ac8))
- **web:** use image frame in crop modal ([196013b](https://github.com/SebaSOFT/copalibre/commit/196013b1867a259bd3bb776cc49a14aa21692f8a))
- **web:** wire the canonical table chrome into the operator standings screen ([3915e34](https://github.com/SebaSOFT/copalibre/commit/3915e340257150df824d621dfda9be1ff632dd38))
- **web:** wire the typed editor into the ruleset override screen ([e640cc9](https://github.com/SebaSOFT/copalibre/commit/e640cc90f9bcffde84bb8bf25b1752644b439708))

### Bug Fixes

- **api,web:** resolve match reports by a real stage-unique ordinal ([29483e7](https://github.com/SebaSOFT/copalibre/commit/29483e704c77f7b1921d537e06ac42a6e6bfee77))
- **api,web:** thread a table-projection row's own name and nationality to the wire ([aa390c2](https://github.com/SebaSOFT/copalibre/commit/aa390c2aac34c0006df61fd8fe2b9bfc549fc989))
- **api,web:** zone-scope the bracket projection to stop cross-zone collisions ([45ac367](https://github.com/SebaSOFT/copalibre/commit/45ac3675bf718ee1000a678fff3ff4d93d22b14c))
- **api:** isolate per-zone winner resolution from ambiguous terminal rounds ([2c1f6de](https://github.com/SebaSOFT/copalibre/commit/2c1f6deea508b96bc14c1a4af0b8d270e07615d4))
- **api:** reconstruct tournament terminal fixtures ([fb2244e](https://github.com/SebaSOFT/copalibre/commit/fb2244ea2cc419f3676b92af9edd2c04b4bfee5c))
- **api:** resolve tournament co-champions ([1064314](https://github.com/SebaSOFT/copalibre/commit/10643141d44d85438cc05816621d479ee72221fc))
- **ci,web:** build tournament-engine dependency for web build producer and update component-graph counts ([35842e8](https://github.com/SebaSOFT/copalibre/commit/35842e86797c4a33c64cd545bc619c86220392af))
- **ci:** align table controls and generated contract ([ea4894e](https://github.com/SebaSOFT/copalibre/commit/ea4894e7fac6946a436e3aa8c737caaa6a6b6c96))
- **ci:** apply prettier formatting and update golden component-graph edge count ([1a548b4](https://github.com/SebaSOFT/copalibre/commit/1a548b445b2a5ff8aa2f6d611b52f2cd5cff4024))
- **ci:** lower BracketCanvas.tsx's KNOWN_INLINE_LAYOUT ratchet count ([df8702e](https://github.com/SebaSOFT/copalibre/commit/df8702eed88c38c869d21eb7b2f05c59c1440525))
- **ci:** point object-storage integration suite at Garage's real port under --network host ([2b582fc](https://github.com/SebaSOFT/copalibre/commit/2b582fc7c4821d3607b5c26d41be0a633b1ec2e7))
- **ci:** register MatchNode.astro's api-client import as accepted debt ([15002a1](https://github.com/SebaSOFT/copalibre/commit/15002a1880d56d63dc0aa8d8b7426a6e8d00d628))
- **ci:** restore missing type imports and Prettier formatting ([4bafac2](https://github.com/SebaSOFT/copalibre/commit/4bafac272de237e89a2e43b265e089cde687c818))
- **ci:** run E2E tests on develop PRs that touch frontend-relevant paths ([f4de5cd](https://github.com/SebaSOFT/copalibre/commit/f4de5cde83cae81fb4bddc455e7e45a05a70c246)), closes [#282](https://github.com/SebaSOFT/copalibre/issues/282)
- **ci:** update component-graph edge count for the AstroPreview entry ([105fb1c](https://github.com/SebaSOFT/copalibre/commit/105fb1cbf8fb3dc72efbda68cce577c6ad7fc2d1))
- **ci:** update component-graph golden count for new story fixtures module ([e62fded](https://github.com/SebaSOFT/copalibre/commit/e62fdeda49c23dbb715269813c860efb0cdb62d7))
- **ci:** use pullable MinIO images for integration tests ([20d550f](https://github.com/SebaSOFT/copalibre/commit/20d550f6cda09a0e155df565c16e6443b1d226cc))
- **ci:** validate modules with release version ([8e6ca6b](https://github.com/SebaSOFT/copalibre/commit/8e6ca6b46c6a3ce3956012aa41f8b37d11f34ffb))
- **control-web:** drop the redundant TBD prefix from pending bracket slots ([e8ad8e3](https://github.com/SebaSOFT/copalibre/commit/e8ad8e32b1aad6978eeced19ad260764dce7c1c2))
- **control-web:** put the focus ring on the chamfered card itself ([11b0311](https://github.com/SebaSOFT/copalibre/commit/11b03117cddce28b5a99afcb6146fe8992fb1a5d))
- **control-web:** satisfy design-system governance for StageListEditor ([4161181](https://github.com/SebaSOFT/copalibre/commit/4161181e6a753949c25bec2f723b372d23c1e450))
- **deploy:** route browser media requests to API ([28ac52b](https://github.com/SebaSOFT/copalibre/commit/28ac52b18b72d1d92d3c53835972ee35bd5bee47))
- **deps:** bump image-size to 2.0.4, closing DoS advisories ([8f898b4](https://github.com/SebaSOFT/copalibre/commit/8f898b4ebe63c4e17390ba638fdb3d7a2380acda))
- **deps:** resolve js-yaml and sharp Dependabot alerts (openspec 0232) ([c69b61e](https://github.com/SebaSOFT/copalibre/commit/c69b61e7fadc5fed6535e06621ef3840634f46fc)), closes [#42](https://github.com/SebaSOFT/copalibre/issues/42) [#43](https://github.com/SebaSOFT/copalibre/issues/43) [#41](https://github.com/SebaSOFT/copalibre/issues/41)
- **design-tokens:** give badge chamfer more inset ([7a18b5f](https://github.com/SebaSOFT/copalibre/commit/7a18b5f4c322aba56d904fb40516386fc9f9b563))
- **docs:** use readable entrant names in bracket-canvas story fixture ([75ec57b](https://github.com/SebaSOFT/copalibre/commit/75ec57baf28c6812112eb52a8e71c98ae59815e1))
- **e2e:** update control-authoring/profile-builder specs for the stage editor ([71b187f](https://github.com/SebaSOFT/copalibre/commit/71b187fee971c468b9219f2f739950850af56a57))
- **public-web,control-web:** follow the chamfer for pending bracket nodes; move console bracket panel to rail's end ([4bbf728](https://github.com/SebaSOFT/copalibre/commit/4bbf7283429b621af5c7065d1670c47d1b014327))
- **public-web:** dash the pending slot, not the whole match card ([daddea5](https://github.com/SebaSOFT/copalibre/commit/daddea52b701c660aa6a3fcb6e19ac5a2c900a25))
- **public-web:** keep bracket cards at the standard --cl-space-4 padding ([89d8823](https://github.com/SebaSOFT/copalibre/commit/89d882395c89cedea0b9199dc203d30eb8735f72))
- **public-web:** stop the score wrapping onto its own line in bracket cards ([ba6749d](https://github.com/SebaSOFT/copalibre/commit/ba6749d2a5160f2440eefe06baba2d2b668de8f6))
- rebase migration rollback test on 0036, regenerate stale OpenAPI artifact ([9a5e7dd](https://github.com/SebaSOFT/copalibre/commit/9a5e7dda7b8738936f9205735322a10792c4deed))
- **rules:** import LocalizedLabel in pipeline.test.ts [0282] ([ad36c48](https://github.com/SebaSOFT/copalibre/commit/ad36c48af75e44474351083e11d5a7d081aaed31))
- **scripts:** bump component-graph ratchet for 0300's new components ([fbc4ced](https://github.com/SebaSOFT/copalibre/commit/fbc4ced6b11c9296477da2f3a9d18d6962ea0f67))
- **scripts:** update component-graph's expected node/edge count ([c912b8f](https://github.com/SebaSOFT/copalibre/commit/c912b8f99af54c23ecc3b8ffe02ef384a0a43c75))
- **scripts:** update role-manual test fixtures for org.manage-club-members ([1ca6192](https://github.com/SebaSOFT/copalibre/commit/1ca61920b7d2650ae339fd8dfe3952500c069092))
- **security:** escape JSON-LD script-breakout, add baseline response headers ([8e61baf](https://github.com/SebaSOFT/copalibre/commit/8e61baf867072dcee39cb7642c4be6c5961fd076))
- **security:** require the exp claim on every verified JWT ([a8b4344](https://github.com/SebaSOFT/copalibre/commit/a8b4344e48f855a4b07c47b4643e8dcc164e3ca5))
- **security:** scope internal error message exposure to typed errors ([b95d22f](https://github.com/SebaSOFT/copalibre/commit/b95d22f094c24b854c8ceb2b578469a7ce958daf))
- **security:** store the accept-invitation access token like every other screen ([5200734](https://github.com/SebaSOFT/copalibre/commit/52007346b4611e905aef340a78b7af666969fa64))
- **tokens:** wrap completion figure header and prevent badge squishing on narrow viewports ([b703571](https://github.com/SebaSOFT/copalibre/commit/b7035718759c6977761daa1584bf0c33af6149b5))
- **web,api,domain:** localize match console ledger categories and segment labels ([826d535](https://github.com/SebaSOFT/copalibre/commit/826d5358603dad43ac04cbcd9b9dcfebffcc1da0))
- **web,api:** localize promotion-plan empty state and resolve entrant names ([4cf3a11](https://github.com/SebaSOFT/copalibre/commit/4cf3a117d3591950f15a4de95c1b2cd15f825cdd))
- **web,domain:** classify forfeited/not-required matches as resolved ([a0eaa7f](https://github.com/SebaSOFT/copalibre/commit/a0eaa7f72ecfa5e847006e47b112612e69d9805d))
- **web,domain:** plain-language rule values, localize FilePicker, i18n standard field labels ([6501c29](https://github.com/SebaSOFT/copalibre/commit/6501c2925fefd6e91c47cddfd1e2002f44297b7e))
- **web,realtime:** propagate live clock and scores from match.event-recorded ([d1a7aec](https://github.com/SebaSOFT/copalibre/commit/d1a7aeceb1bd3814214334e1a7364ac55a09aae7))
- **web:** add gap between tournament-total and match-by-match tables ([3329148](https://github.com/SebaSOFT/copalibre/commit/3329148941949846b3483fa35a87402af8ba1373))
- **web:** allow configured local site hostname ([4483120](https://github.com/SebaSOFT/copalibre/commit/44831206503e800b8f6a1169c3b01e5016e01893))
- **web:** bump component-graph ratchet count for the new LinkButton atom ([61a620a](https://github.com/SebaSOFT/copalibre/commit/61a620adce9df05bc18d60619bd0da4ae6d55310))
- **web:** correct e2e conformance gaps surfaced by 0251's CI run ([5aadd4e](https://github.com/SebaSOFT/copalibre/commit/5aadd4e436474e5f7364be8d498c0c5289dc3455))
- **web:** correct Spanish "final" to "finalizado" for a resolved match ([64adacb](https://github.com/SebaSOFT/copalibre/commit/64adacb8fbe0483b1f173418f8690765ac40930b))
- **web:** extract field-validation-view helpers to clear the CRAP gate (openspec 0233) ([2e3e95e](https://github.com/SebaSOFT/copalibre/commit/2e3e95ee1889a2f82abe8f3bcfc11a0131fb51c0))
- **web:** fall back to the placeholder when an emblem/photo fails to load ([63edb6e](https://github.com/SebaSOFT/copalibre/commit/63edb6ea43563bb3dd732e78fccb635794c05af4))
- **web:** field-level errors and grid weighting on the wizard Name step (openspec 0233) ([c082eae](https://github.com/SebaSOFT/copalibre/commit/c082eae26d8a8d7044aa7dafb8438312dcf7d6f0))
- **web:** localize invitation acceptance and center the shared auth layout ([a9ab10a](https://github.com/SebaSOFT/copalibre/commit/a9ab10acc814765936b603e866b57276ecf3d0f7))
- **web:** localize TV result-state labels ([0af04a2](https://github.com/SebaSOFT/copalibre/commit/0af04a2823dcd62647cdf9e900035b1a35eaaa01))
- **web:** make the tournament hero a true full-bleed image, not a card ([3b27fba](https://github.com/SebaSOFT/copalibre/commit/3b27fbac9d2b1bc8dbe0542f5533735f5208ac01))
- **web:** preserve mock entrant labels, fix layout hierarchy and CI checks [0282] ([bf92ff4](https://github.com/SebaSOFT/copalibre/commit/bf92ff4e18a9c86fc88443b64d9f5e5a70a41a76))
- **web:** ratchet preferences style debt ([58a008a](https://github.com/SebaSOFT/copalibre/commit/58a008a6ece4a188468715a042644fc4230ca19e))
- **web:** remove unused test variable in AuditTrailPage.test.tsx ([8d574d5](https://github.com/SebaSOFT/copalibre/commit/8d574d5518f1b0734ae3106deed42245415fb701))
- **web:** resolve undeclared design token and update component-graph edge count ([a7f7a96](https://github.com/SebaSOFT/copalibre/commit/a7f7a96ba7e828a459b325a1636f75de1eda86b3))
- **web:** satisfy the token-contract and story-coverage gates for 0245 ([49a095b](https://github.com/SebaSOFT/copalibre/commit/49a095b0b1a77c1b3f73f3b5912b74d7fe4231ab)), closes [#0a0f1d](https://github.com/SebaSOFT/copalibre/issues/0a0f1d)
- **web:** stop guessing ResponsiveTimestamp's locale from navigator ([c52c129](https://github.com/SebaSOFT/copalibre/commit/c52c12970d8d3646c8f355a87b918a62c8a29911))
- **web:** trace chamfer on entrant journey highlight and update screenshots ([ec8b51b](https://github.com/SebaSOFT/copalibre/commit/ec8b51bb41421249a550c22e48f8317230587ed1))

## 1.0.1 (2026-08-31)

No 1.0.0 was published: GitHub's immutable-release protections blocked completing that tag/release
after a CI-only issue in its CLI-binary upload step, and the tag name can't be reused once that
happens. This is the actual first stable release; everything below shipped together.

### Features

- **tournament-engine:** add multi-match series generation and resolution ([9d078ce](https://github.com/SebaSOFT/copalibre/commit/9d078ce))
- **series:** make multi-match series reachable by an organizer ([2f89a96](https://github.com/SebaSOFT/copalibre/commit/2f89a96))
- **standings:** thread series accounting grain through engine, API, and both web surfaces ([8180e9c](https://github.com/SebaSOFT/copalibre/commit/8180e9c))
- **control-web:** explain every wizard decision and its reversibility ([2e3bae3](https://github.com/SebaSOFT/copalibre/commit/2e3bae3))
- **control-web:** role-aware help surfaces, gated against the spec baseline ([71f539d](https://github.com/SebaSOFT/copalibre/commit/71f539d))
- **mcp,domain,web:** publish an agent-facing discipline-authoring contract ([5f5a36d](https://github.com/SebaSOFT/copalibre/commit/5f5a36d))
- **web,api,module-distribution:** author disciplines and tournament profiles from the control panel ([5c597c8](https://github.com/SebaSOFT/copalibre/commit/5c597c8))
- **auth,help:** declared organization capability mapping and role manual pages ([3c219cb](https://github.com/SebaSOFT/copalibre/commit/3c219cb))
- **audit:** operational traceability — refusals, sensitive reads, and a readable audit trail ([2be82cf](https://github.com/SebaSOFT/copalibre/commit/2be82cf))
- **registrations:** register participants directly, without a CSV file ([dc1c4d8](https://github.com/SebaSOFT/copalibre/commit/dc1c4d8))
- **structure:** let organizers correct competition structure and storage ([7db7d24](https://github.com/SebaSOFT/copalibre/commit/7db7d24))
- **rulesets:** let organizers revise ruleset and stage-configuration overrides ([a457ada](https://github.com/SebaSOFT/copalibre/commit/a457ada))
- **access:** let admins rescind invitations, unlink participants, and remove unused persons/teams ([72cd841](https://github.com/SebaSOFT/copalibre/commit/72cd841))
- **rulesets:** persist compiled rulesets on every write path, canonicalize union-list merges ([4a1bb2c](https://github.com/SebaSOFT/copalibre/commit/4a1bb2c))
- **matches-view:** add a series/zone-aware matches view to the public site and control panel, with a summary or full comparator trace depending on authority ([a06b9f6](https://github.com/SebaSOFT/copalibre/commit/a06b9f6))

## 0.6.0-preview (2026-08-27)

### Features

- **api:** enforce unknown request fields rejection on write DTOs ([faab927](https://github.com/SebaSOFT/copalibre/commit/faab927))
- **api:** global request ValidationPipe with decorated request DTOs ([ff5db2c](https://github.com/SebaSOFT/copalibre/commit/ff5db2c))
- **api:** shared rate limiting through PostgreSQL for horizontal scaling ([7b80070](https://github.com/SebaSOFT/copalibre/commit/7b80070))
- **api:** rate-limit auth and resource-heavy endpoints with shared counter storage ([64b3c45](https://github.com/SebaSOFT/copalibre/commit/64b3c45))
- **security:** block PAT scope privilege escalation ([696a71a](https://github.com/SebaSOFT/copalibre/commit/696a71a))
- **security:** revoke legacy un-scoped personal access tokens ([d48c6d3](https://github.com/SebaSOFT/copalibre/commit/d48c6d3))
- **auth:** restore personal access token authentication with permission scoping ([1fd787a](https://github.com/SebaSOFT/copalibre/commit/1fd787a))
- **web:** complete atomic design component system and UI ownership guard ([274c88f](https://github.com/SebaSOFT/copalibre/commit/274c88f))
- **web:** migrate tournament wizard to owned UI components ([3c99cba](https://github.com/SebaSOFT/copalibre/commit/3c99cba))
- **web:** migrate crop overlay to modal and standings to data-table ([2799322](https://github.com/SebaSOFT/copalibre/commit/2799322))
- **web:** migrate admin screens to atomic design templates ([03129fb](https://github.com/SebaSOFT/copalibre/commit/03129fb))
- **ci:** release workflow pre-release detection and GHCR latest tag gating

## 0.5.0-beta (2026-08-25)

### Features

- standings with an engine-sourced tiebreak trace, and the seeding builder ([1802893](https://github.com/SebaSOFT/copalibre/commit/1802893462994299f18adbd225a7772bec25b80b))
- reachable statistics rebuild, honest career-absence state ([92b7bb1](https://github.com/SebaSOFT/copalibre/commit/92b7bb1fc66a846be3946b244b93aee7a35556a2))
- football foul and throw-in vocabulary via outcome-choice ([ea22a22](https://github.com/SebaSOFT/copalibre/commit/ea22a22f148ea320c1ce20a0ae2fb1881cc5f09d))
- pre-fill the seeding builder from a reviewed promotion plan ([bcb6ea9](https://github.com/SebaSOFT/copalibre/commit/bcb6ea923ef41cf5bfbc9312f4c8454db37767a7))
- client-side crop/resize and server dimension enforcement for uploads ([3f3559f](https://github.com/SebaSOFT/copalibre/commit/3f3559fc8611c188c5d7aa2cd6579f12a2eb7a53))
- offline-resilient match console with write-ahead sync queue ([60bb3d6](https://github.com/SebaSOFT/copalibre/commit/60bb3d6888315c0ab625f9cdc2079419cbd0fe5f))
- venue/official management and manual schedule builder ([0f338f6](https://github.com/SebaSOFT/copalibre/commit/0f338f689616b84791d04f62ded2479c5454f49a))
- add organization access and SQLite test profile ([ead8bef](https://github.com/SebaSOFT/copalibre/commit/ead8bef14401015c649075f8ffd6bde62d265d22))
- **api,web:** add GET person profile endpoint and matching frontend types ([1bfece7](https://github.com/SebaSOFT/copalibre/commit/1bfece7b73ebc1255eb5b3551d6049f70fae3c35))
- **api:** add person photo/nationality and club emblem endpoints ([e1299c7](https://github.com/SebaSOFT/copalibre/commit/e1299c7a31e84a3cdf491d562d6c235245b2ae58))
- **api:** add public person profile projection endpoint and OpenAPI contracts ([c6abcd5](https://github.com/SebaSOFT/copalibre/commit/c6abcd5e4af841a9f74d15046894653f24003d9c))
- **api:** add public tournament listing endpoint with winner and runner-up resolution ([64f054a](https://github.com/SebaSOFT/copalibre/commit/64f054a3594e297a4a396dcf004cf3f1802f4437))
- **api:** add zone and group draw routes ([9a45a4a](https://github.com/SebaSOFT/copalibre/commit/9a45a4ae622b0bf87cf97a1f8a76813f99b40614))
- **api:** JWT auth, four-plane policy layer and OpenAPI contract ([2fe0463](https://github.com/SebaSOFT/copalibre/commit/2fe0463610c823119c17b52ffdae1bf575968d29))
- **api:** restrict CORS origin to COPALIBRE_APP_URL ([32d3592](https://github.com/SebaSOFT/copalibre/commit/32d35920f82e1f2404953f64404edf6369efa435))
- **api:** thread roster-member nationality and team/club identity into the match console ([a35d979](https://github.com/SebaSOFT/copalibre/commit/a35d97959e5453201e9bf2c923e360a8a44fd96f))
- bootstrap monorepo toolchain (openspec 0001) ([233ff08](https://github.com/SebaSOFT/copalibre/commit/233ff08bb21c3f5e04de7ad0d0af5c1148f9ec88))
- **broadcast:** add the device-scoped display-token mechanism ([da856a2](https://github.com/SebaSOFT/copalibre/commit/da856a2473392329bce651c9094e41a09511f4d9))
- **broadcast:** build the /tv/** kiosk, overlay and branding surface ([bece20d](https://github.com/SebaSOFT/copalibre/commit/bece20d1c77e1a5862ad334b651624ab7b31d795))
- **broadcast:** surface TV device health in the A1 dashboard ([663c8fb](https://github.com/SebaSOFT/copalibre/commit/663c8fbb61c2b685c49e62a2e860e1c3639b4745))
- **catalogue:** add localized module descriptions ([21115dc](https://github.com/SebaSOFT/copalibre/commit/21115dc3a71cdefb92ec557f90cd08d2b95cf599))
- **catalogue:** complete football and tennis rules and vocabulary ([1ca66f8](https://github.com/SebaSOFT/copalibre/commit/1ca66f85bfc45e1dce8c587cc42d8e4efd896d80))
- **catalogue:** seed default modules ([930d53a](https://github.com/SebaSOFT/copalibre/commit/930d53ad487300764f1422dad2bb0458f2d45840))
- **cli,api:** authenticated HTTP admin surface for statistics-rebuild and module management ([ba79036](https://github.com/SebaSOFT/copalibre/commit/ba79036ffcf7148d3249d948f4db905c13c0582d))
- **cli:** comprehensive --help output and a /help/cli/ docs section ([b114b33](https://github.com/SebaSOFT/copalibre/commit/b114b336039c5198783087cba015e991ec0fdaf3))
- **cli:** compressed, retention-managed backup/restore packets ([55e0f1d](https://github.com/SebaSOFT/copalibre/commit/55e0f1db1ea8d75b9e61c338ae384adbbfb4b8bf))
- **cli:** copalibre mcp — a local stdio MCP server for AI agents ([5bedbe3](https://github.com/SebaSOFT/copalibre/commit/5bedbe3942cf31eab3b1f70bd8600dc28236f927))
- **cli:** real upgrade-check and a documented non-destructive upgrade path ([88d4b46](https://github.com/SebaSOFT/copalibre/commit/88d4b46da9ac9e6d4be9debedcd303d34daf7678))
- **cli:** scaffold, validate-local, and submit modules; matching MCP tools ([d9fe29c](https://github.com/SebaSOFT/copalibre/commit/d9fe29c3fbeeb2215b0218ac570965d6b29c8713))
- **cli:** version-aware restore with automatic migrate and schema verification ([8b12387](https://github.com/SebaSOFT/copalibre/commit/8b123870d20e4513957ece8e87397a0dff79e26d))
- **contracts:** update OpenAPI schema and generated types for organization tournament listing ([86afc3f](https://github.com/SebaSOFT/copalibre/commit/86afc3f54390480218b1fb64a1f9c9a832bf7f90))
- **control-web,api:** add club management screen and organization emblem ([aa81787](https://github.com/SebaSOFT/copalibre/commit/aa8178788fc9f0c1e9ae7116d95b46edf1397e48))
- **control-web:** add zone/group management, entrant assignment, group-scoped standings, and promotion plan screens ([bb4b061](https://github.com/SebaSOFT/copalibre/commit/bb4b0611ca186d7fafa9465ba6540a4fd5f7a6f8))
- **control-web:** convert control panel to a client-routed SPA ([307336b](https://github.com/SebaSOFT/copalibre/commit/307336bcaf15f904b31e4e1b6046665cb6851b1e))
- **control-web:** surface entrants needing an abbreviation ([96bf8f9](https://github.com/SebaSOFT/copalibre/commit/96bf8f9a41278d15c9037c7f5bb448f407e5845d))
- **control-web:** translate control-panel chrome into fr/pt/it/de/ru ([47fb796](https://github.com/SebaSOFT/copalibre/commit/47fb7964e18c87618f8067613c250862c5a0d3dd))
- **control-web:** wire tournament creation wizard fields and profile instantiation ([dcffd00](https://github.com/SebaSOFT/copalibre/commit/dcffd00514db6e90b8b851d4e50f3ff455fcd1b1))
- **control:** add platform administration console ([9e271ce](https://github.com/SebaSOFT/copalibre/commit/9e271cea703bcbbf05fbd1a112ae2b2095e4af4f))
- **control:** add tournament authoring and registration review foundations ([db06485](https://github.com/SebaSOFT/copalibre/commit/db064853f908da4b2c525ced0d1b0800a70a2e07))
- **control:** the organization dashboard, with a token that is never written down ([dc2d552](https://github.com/SebaSOFT/copalibre/commit/dc2d552d51591cc492fb9e6edec516ed221f31e8))
- **control:** wire tournament authoring and review flows ([7dc5920](https://github.com/SebaSOFT/copalibre/commit/7dc592055e69824ddbaaf6415788c26a128e25c8))
- **copalibre-cli:** init-anywhere instance model with marker-aware dispatch ([837b776](https://github.com/SebaSOFT/copalibre/commit/837b776624adf34206bfdbd44a3d34ae4b3c3d41))
- **copalibre:** copalibre --version prints a larger ASCII logo ([a936694](https://github.com/SebaSOFT/copalibre/commit/a93669442304f936c4691b715cfd38422f4685ff))
- **copalibre:** redesign compact mark, read the large logo from one file ([e4ec589](https://github.com/SebaSOFT/copalibre/commit/e4ec589a68010f98bcf6f729959006586e0fd64d))
- **data:** add reviewed csv import pipeline ([0c872a4](https://github.com/SebaSOFT/copalibre/commit/0c872a4016367cbfc2e85aa32c1ac4e57ed0eb99))
- **deploy:** add the Compose/Helm env-var parity check ([7363db3](https://github.com/SebaSOFT/copalibre/commit/7363db386d66d8c6c1b524554cb55b08e2f4eb4f))
- **deploy:** add the K3s/Helm chart ([8804d30](https://github.com/SebaSOFT/copalibre/commit/8804d30ce000c8396619911cb1feec1da4c27e00))
- **deployment:** add docker compose and CLI setup ([828d760](https://github.com/SebaSOFT/copalibre/commit/828d760e2aff89f6179236078fdb944d0feb0570))
- **deploy:** validate the Helm chart against a real K3s cluster ([dba1c7d](https://github.com/SebaSOFT/copalibre/commit/dba1c7df1206d2a88a71ead3e25184b8e5197d76))
- **design-tokens:** add typography and breakpoint scales ([7300b71](https://github.com/SebaSOFT/copalibre/commit/7300b71d3e0a8412338ca679e266d15e68e925f8))
- **design-tokens:** one token source, generated into CSS and Tailwind ([8ea2672](https://github.com/SebaSOFT/copalibre/commit/8ea2672a30931b1938da16f4cc939f1ef32df6fb))
- **doctor:** validate JWKS URI content, not only resolvability ([b64b02e](https://github.com/SebaSOFT/copalibre/commit/b64b02e80d4170fd19bd82d242c1464dd5fa1ea1))
- **domain,api,web:** add per-competitor result reason ([8197a61](https://github.com/SebaSOFT/copalibre/commit/8197a612020347aabda3f87ac57ae9a7cf40c3aa))
- **domain,api,web:** add public player leaderboards and club filtering ([cc7dbce](https://github.com/SebaSOFT/copalibre/commit/cc7dbced130f94979c154e9f89e16ad8c6a36aba))
- **domain,persistence,api,web:** structured match rosters and tactile jersey-grid console ([0d42e81](https://github.com/SebaSOFT/copalibre/commit/0d42e81d745645f0a463a27b0995130886ccc41b))
- **domain,tournament-engine,api,web:** declarative table layouts and rankings ([29117bb](https://github.com/SebaSOFT/copalibre/commit/29117bbc4a3f855bfbf2c9cf04fa31b2bb957c3d))
- **domain,tournament-engine,api,web:** declarative target actor attribution for statistic and tag effects ([978e52c](https://github.com/SebaSOFT/copalibre/commit/978e52c3ed0ded386b7ccc4a38d20e70704ed728))
- **domain:** add nationality and photo/emblem references to Person and Club ([4d1990d](https://github.com/SebaSOFT/copalibre/commit/4d1990d7447557c340590f00b58b3c1b1fef3325))
- **domain:** add official and venue as roll-up-terminal actor granularities ([3460731](https://github.com/SebaSOFT/copalibre/commit/3460731e34fe3d2ce553e152b292d0e6a4c24298))
- **domain:** add person birthDate validation and organization-scope career collector ([261a47c](https://github.com/SebaSOFT/copalibre/commit/261a47ca36e0eac9eb7193753318031893d873f4))
- **domain:** attribution, semver, capabilities and profiles ([81e8d3d](https://github.com/SebaSOFT/copalibre/commit/81e8d3d89efb149ab954c4e66aebf8f5e36f7e99))
- **domain:** localize discipline and tournament-profile display labels ([3b1ffee](https://github.com/SebaSOFT/copalibre/commit/3b1ffee7b4c30451af398fc87ff64dfdcab79df3))
- **domain:** started status, competition record and module docs ([941324a](https://github.com/SebaSOFT/copalibre/commit/941324a180b3fafed6f5e5d67386b029cbeaab65))
- **domain:** tournament domain model core ([a855c5d](https://github.com/SebaSOFT/copalibre/commit/a855c5de19cb9bf513432fba8b3bc3e29231effb))
- **engine:** add zone and group draws ([7a3ea83](https://github.com/SebaSOFT/copalibre/commit/7a3ea83f84ef46de6ff6377d5de136f920801bad))
- **engine:** evaluate grouped promotions ([36f00db](https://github.com/SebaSOFT/copalibre/commit/36f00dbc0a1c10ac8777a754bc66c45dd45ce168))
- **engine:** fixture generation, standings and advancement ([3de224c](https://github.com/SebaSOFT/copalibre/commit/3de224c2aee6b6c2447d8a11a00c8d8164a9ebf0))
- **engine:** generate fixtures by group scope ([6792620](https://github.com/SebaSOFT/copalibre/commit/6792620888204774a29967d2d8d738a91a838651))
- **events:** deliver live updates over SSE, with a cursor that survives a reconnect ([589b335](https://github.com/SebaSOFT/copalibre/commit/589b33595c80c32c9e2194908bb43ba67949fe0b))
- **export:** add tournament configuration document ([1ee79c6](https://github.com/SebaSOFT/copalibre/commit/1ee79c653af22f4a767b55693d5b7dbb229eed33))
- **help:** add static docs and API reference ([1b61774](https://github.com/SebaSOFT/copalibre/commit/1b61774144afa80ae74e6336ea71ca650b33638b))
- **i18n:** add Mandarin Chinese as an eighth supported language ([9613883](https://github.com/SebaSOFT/copalibre/commit/96138836e283b3f597c6f708f801dbc25c6fa843))
- **i18n:** add translation content-accuracy review mechanism ([e8007e5](https://github.com/SebaSOFT/copalibre/commit/e8007e564d6319c94c25a4796451693d25d726ac))
- **i18n:** extract control-panel interface strings to a message catalog ([ac53f6d](https://github.com/SebaSOFT/copalibre/commit/ac53f6dee0e51681cbc3da5aa54cd95ab86e7c16))
- **i18n:** help site content in French, Portuguese, Italian, German, and Russian ([ecda6b2](https://github.com/SebaSOFT/copalibre/commit/ecda6b2b3c9106f599138174871c633c232c2256))
- **i18n:** platform internationalization foundation ([e7f097d](https://github.com/SebaSOFT/copalibre/commit/e7f097d7bc93cb6a62ee08c8abebd688def9b497))
- **identity:** give a club an alias it can suggest, and ten characters to work with ([d0243c6](https://github.com/SebaSOFT/copalibre/commit/d0243c665a0905052f5cd92fcb0085d61f1c7281))
- **identity:** give a club and a team the short label a board can fit ([0364736](https://github.com/SebaSOFT/copalibre/commit/0364736d624cac7d255f309343c8fe8738ced3cd))
- implement native identity provider and personal access tokens ([74c6a8d](https://github.com/SebaSOFT/copalibre/commit/74c6a8d7c861ee26b2ad0ee756dce0e4b749a47f))
- **lifecycle:** add archived_at, fix the 409 conflict path, add archival tests ([628d7c7](https://github.com/SebaSOFT/copalibre/commit/628d7c71caf3ce613a2f85fb01ac2bfa934f0238))
- **lifecycle:** add the tournament lifecycle state machine ([d9b0f96](https://github.com/SebaSOFT/copalibre/commit/d9b0f9697b80e5b96ab5f41350585552daa832f8))
- **lifecycle:** add tournament archival and the active-only listing ([f7ec4c6](https://github.com/SebaSOFT/copalibre/commit/f7ec4c64436328c680cd23471ddb59a97200598a))
- **lifecycle:** archive a tournament from the A1 dashboard ([20d72f3](https://github.com/SebaSOFT/copalibre/commit/20d72f362319782297b78ddf2d49887e4c529fcf))
- **live-console:** add authoritative match operations ([8c594ab](https://github.com/SebaSOFT/copalibre/commit/8c594abae4c567ee87e0f7ec9811ddef40c08c12))
- **live-operations:** add match roster selection write path ([10abd05](https://github.com/SebaSOFT/copalibre/commit/10abd0587c94679496aac064d8429ada99ec2e51))
- **modules:** add discipline background images ([27c086d](https://github.com/SebaSOFT/copalibre/commit/27c086d77c7fa58957d9e3e506b4554112d83e25))
- optional free-text notes on any recorded match event ([878b153](https://github.com/SebaSOFT/copalibre/commit/878b153f731b008714276e26f531a7b34601bfb0))
- **persistence,api:** backfill resultReason and always write it explicitly ([903dcd1](https://github.com/SebaSOFT/copalibre/commit/903dcd199ae513f4d2149cc2c3a60f000e40d665))
- **persistence:** add birth_date column migration, competition history and career totals queries ([b0447c5](https://github.com/SebaSOFT/copalibre/commit/b0447c5fe371b2258e7f693188ca5435673d4879))
- **persistence:** add organization tournament listing queries and entrant podium resolver ([a17a87c](https://github.com/SebaSOFT/copalibre/commit/a17a87c708d867f27fef1041e43debb134fddd0c))
- **persistence:** persist zones and groups ([b203402](https://github.com/SebaSOFT/copalibre/commit/b203402f1339759b2064c14e70f6e0aa7937a112))
- **persistence:** postgres repositories, outbox and audit trail ([0640321](https://github.com/SebaSOFT/copalibre/commit/0640321d049484961c32af9281af8082cfe23123))
- **persistence:** record zone and group draws ([eb7c4c3](https://github.com/SebaSOFT/copalibre/commit/eb7c4c3de2b803b91bdc68af6f516f717e937a50))
- **persistence:** store person nationality/photo and club emblem references ([0fc0725](https://github.com/SebaSOFT/copalibre/commit/0fc0725997fc04f12ffddb07f8b5d461cce5f431))
- **platform:** add localized stackable notifications ([28d3cb6](https://github.com/SebaSOFT/copalibre/commit/28d3cb62358057c0f5c07599354a13e43fe268c2))
- **public-web:** add public match reports ([0e82962](https://github.com/SebaSOFT/copalibre/commit/0e82962696de815835c9340b3c0c1a12f1dd3df7))
- **public-web:** link bracket match cards to their report page ([a1f94da](https://github.com/SebaSOFT/copalibre/commit/a1f94da8d80e61d9850daa1d656702fc5cd0f80d))
- **public-web:** locale-prefixed routes and interface-string extraction (English/Spanish) ([3e6a5fa](https://github.com/SebaSOFT/copalibre/commit/3e6a5fadea6e485a99758e5b624e7bec38e520b9))
- **public-web:** translate interface into fr/pt/it/de/ru ([9c2524b](https://github.com/SebaSOFT/copalibre/commit/9c2524b2dff8eb1eadacf46c77ed10a41215a379))
- **release:** adopt 0.2.0, gate e2e/deploy chain to main, add release workflow ([d156a12](https://github.com/SebaSOFT/copalibre/commit/d156a129b10b42a5b793af0e0647316d7d0981ab))
- **reports:** add report/dispute submission and review endpoints ([112a8df](https://github.com/SebaSOFT/copalibre/commit/112a8df21bcf4ad69c241a65141b410a0d118ec8))
- **reports:** add the operator pending reports/disputes queue ([551a129](https://github.com/SebaSOFT/copalibre/commit/551a129cb106fa693e0eb43056a4184796ce78b1))
- **reports:** add the participant report/dispute fact type ([65f31e3](https://github.com/SebaSOFT/copalibre/commit/65f31e3f48a392477ac78e9f3d54e86c88d97119))
- **reports:** authorize report/dispute submission by match membership ([0aa61f3](https://github.com/SebaSOFT/copalibre/commit/0aa61f3ad1df6a71e9c31020b88639e20913a650))
- **roster:** rename match lineup terminology ([0a6835c](https://github.com/SebaSOFT/copalibre/commit/0a6835c3d7b7e6227abd9553eccedcc64cab547a))
- **routing:** add the person-profile control screen ([f4d822b](https://github.com/SebaSOFT/copalibre/commit/f4d822b0d201a6a7ced504514b109f27c77c99b3))
- **routing:** support listing routes in canonical URL builder ([270bb52](https://github.com/SebaSOFT/copalibre/commit/270bb52930bbc44f2c30ebcd92b6cd4a904d426d))
- **rules,persistence,api:** wire collector-threshold rules into event-recording notifications ([f774e23](https://github.com/SebaSOFT/copalibre/commit/f774e236ca777bbff65eacc3ad123cd64623370a))
- **rules:** add per-event rule authoring ([c3b0831](https://github.com/SebaSOFT/copalibre/commit/c3b0831d04aac8c8bf02448fd233879749d20620))
- **rules:** let a rule reason about a collector's running total ([209dca6](https://github.com/SebaSOFT/copalibre/commit/209dca674761353301d39cfdcf8b793013ef0424))
- **rules:** neuron-js adapter with tiebreak pipeline and guards ([6d58295](https://github.com/SebaSOFT/copalibre/commit/6d5829574d7b99986cbec16cc77b3f56094c8823))
- **seeding:** persist a published seed order and regenerate fixtures ([d797f24](https://github.com/SebaSOFT/copalibre/commit/d797f24b6471e595a593784f28a66df4e12492b2))
- **statistics:** fold facts into figures on both axes at once ([c59d675](https://github.com/SebaSOFT/copalibre/commit/c59d6758be0ab88187d960e63ea7a6fb6a61462b))
- **statistics:** store folded figures and recompute them on correction ([b2b7182](https://github.com/SebaSOFT/copalibre/commit/b2b7182df1289df87073c409becfb8b4fc49c1c6))
- **statistics:** tag-scoped statistic collectors ([f81538f](https://github.com/SebaSOFT/copalibre/commit/f81538f4c75d6332571bf02756d9d1e78f2225b3))
- **statistics:** wire the fold engine into the write and read paths ([fc3a8a3](https://github.com/SebaSOFT/copalibre/commit/fc3a8a3188972b399e7540c427ebb553dc9efdd4))
- **storage:** add organization storage usage report ([2551e65](https://github.com/SebaSOFT/copalibre/commit/2551e65542490f947f865747e611e612a9841d97))
- **tags:** declare non-numeric state, and enforce none of it ([7e4c064](https://github.com/SebaSOFT/copalibre/commit/7e4c064f8ac6dac3f422d02f1ea33256f0701044))
- **tags:** let either side say where a produced fact is scoped ([b0e870e](https://github.com/SebaSOFT/copalibre/commit/b0e870e300357350afa40d2aaa418d3ea90a05ad))
- **tournament:** add zone and group foundations ([5dcda2a](https://github.com/SebaSOFT/copalibre/commit/5dcda2a4dbf7c75d127d8e4925e521d551f6e80b))
- **tournament:** persist group promotion plans ([a4838e9](https://github.com/SebaSOFT/copalibre/commit/a4838e9a4eae52041c78e7c5d59c5b2bd4a69b79))
- **tournaments:** add entrant abbreviations ([b243e7d](https://github.com/SebaSOFT/copalibre/commit/b243e7d29a30502e968ed4a557334fc26b3187f7))
- **web,api:** merge organization tournaments into /{organization} ([9c5708c](https://github.com/SebaSOFT/copalibre/commit/9c5708c2d3521e4f44fd595ec9c92c41673aff33))
- **web,cli:** publish llms.txt and enrich MCP tool/server descriptions ([79e1e23](https://github.com/SebaSOFT/copalibre/commit/79e1e2366ed6d86e4f263e2265afa1c2b73b42ff))
- **web:** add bulk/structured match-data entry screen with CSV import ([0451e9b](https://github.com/SebaSOFT/copalibre/commit/0451e9bdddcf70c18abe8b89f3dc017239777da4))
- **web:** add contextual help links to control-panel screens ([640a7c2](https://github.com/SebaSOFT/copalibre/commit/640a7c22a1b06f7363dae26054c81df9732697d8))
- **web:** add country name/flag helpers, CountrySelect, and image placeholders ([aaa62d5](https://github.com/SebaSOFT/copalibre/commit/aaa62d506ec10a4becb8c9c94737ade4d318ac54))
- **web:** add organization tournament listing page with winner podium and hero layout ([d049b4e](https://github.com/SebaSOFT/copalibre/commit/d049b4e4694eab188a1c6743ad8629883d2001d1))
- **web:** add player profile career popup dialog and standalone view ([1c8d735](https://github.com/SebaSOFT/copalibre/commit/1c8d735741b4a5ba95d93aa174296e36f4db8b50))
- **web:** add the person-profile screen ([ebd699a](https://github.com/SebaSOFT/copalibre/commit/ebd699abb317ca14a79e720094d067df477f8116))
- **web:** add tournament authoring and registration review screens ([b9d2b10](https://github.com/SebaSOFT/copalibre/commit/b9d2b10f0a42f2850b9f64e78f69a7d1cdd72230))
- **web:** make product screens responsive ([b6f498b](https://github.com/SebaSOFT/copalibre/commit/b6f498b7ca11e0e4203cccc847d2fbf3bfc098ed))
- **web:** nationality editor, photo upload, and profile link on registration review ([d7af9c7](https://github.com/SebaSOFT/copalibre/commit/d7af9c723a96017469285c65d8f688103f4bec3c))
- **web:** render nationality flags and club emblems in the jersey grid ([9eb35b3](https://github.com/SebaSOFT/copalibre/commit/9eb35b33f4de0aeb71c1fd720e1b97c1c05b6c3f))
- **web:** serve the CopaLibre logo as favicon and brand mark ([991885c](https://github.com/SebaSOFT/copalibre/commit/991885c77078cbad5a6e9edfe87335bb2b181221)), closes [#00D4FF](https://github.com/SebaSOFT/copalibre/issues/00D4FF) [#0ff](https://github.com/SebaSOFT/copalibre/issues/0ff)
- **web:** the live dashboard and the public bracket ([91d2b39](https://github.com/SebaSOFT/copalibre/commit/91d2b39b76a5bfdfa759b19a5d74c94e112c7dc8))
- **web:** the public tournament overview, complete without JavaScript ([fcde20b](https://github.com/SebaSOFT/copalibre/commit/fcde20b0a8a4b993250d881d75af8c3fc08d72b2))
- **web:** wire nationality/photo actions and real display names into registration review ([5275f8e](https://github.com/SebaSOFT/copalibre/commit/5275f8e90a89fb9fad8a2cd5315abe7fd0e4e7e7))
- **web:** wire the public club filter and real dashboard data ([6dc1e33](https://github.com/SebaSOFT/copalibre/commit/6dc1e33bb13f8ea659d7c6b6a13f899a2a628fc1))
- **worker,scheduler:** durable background work on PostgreSQL alone ([6ea916e](https://github.com/SebaSOFT/copalibre/commit/6ea916e53a37bd81d7a3abc09e7c3f6f8a19527f))

### Bug Fixes

- unblock CI, stop the roster endpoint reporting a success it never performed ([0040866](https://github.com/SebaSOFT/copalibre/commit/0040866f665aa3e70510127cfe09def9471338be))
- raise branch/function coverage for the two new route screens ([1bc902e](https://github.com/SebaSOFT/copalibre/commit/1bc902ea070ac5787421e69447c20131f874cad9))
- adjust PAT hashing and test expectations ([3435e01](https://github.com/SebaSOFT/copalibre/commit/3435e01009b00768c11cf84a94297782d108205a))
- **api:** snapshot bulk-loaded roster identity from Person, not the request ([194adcb](https://github.com/SebaSOFT/copalibre/commit/194adcb5602ef478dcfa67239ebccf54711fe54e))
- **auth:** actually send password-reset emails ([b1707eb](https://github.com/SebaSOFT/copalibre/commit/b1707eb71fc6ad72dc6c5b219844f4ae59671394))
- **broadcast:** conform TV routes to the real routing contract ([484d2ab](https://github.com/SebaSOFT/copalibre/commit/484d2abd659a47030bff133fa9ede47a0e859a07))
- **broadcast:** resolve the TV stream's tournament alias to a real id ([ddad150](https://github.com/SebaSOFT/copalibre/commit/ddad150a5d546d776a22aefcf8037e2b5fe4816d))
- **build:** preserve web and SEA builds ([5c5fc11](https://github.com/SebaSOFT/copalibre/commit/5c5fc11650db805fc4092bacf7f6d66a59b8db3f))
- change 'system' to nil uuid in PAT repository ([f60cc45](https://github.com/SebaSOFT/copalibre/commit/f60cc45bf287814cca2391926bb9412c611d6a40))
- change principal_id type to uuid in migration and fix test mock data ([ab4d6d4](https://github.com/SebaSOFT/copalibre/commit/ab4d6d4a1c2c14bfc2aa7e335d7f91594e30e491))
- **ci:** build @copalibre/domain before every Astro build of apps/web ([a0b1da7](https://github.com/SebaSOFT/copalibre/commit/a0b1da703d8d7bf909ba01c15ee726789b2b972f))
- **ci:** build @copalibre/domain before the E2E tests job's Astro build too ([faf2b98](https://github.com/SebaSOFT/copalibre/commit/faf2b98a12ed404bfa8dc96f314e09e856b5c2c1))
- **ci:** build realtime before the site, as the React island imports it ([95f5065](https://github.com/SebaSOFT/copalibre/commit/95f5065764b2644c7aac96ba2197deb8f6faee16))
- **ci:** build routing before the site, and map it in every jest config ([cffd7cd](https://github.com/SebaSOFT/copalibre/commit/cffd7cdef783b8366935e2bf707ac73e3d9c280e))
- **ci:** declare apps/api's real new dependency on module-distribution, add its missing unit tests ([18ae7f3](https://github.com/SebaSOFT/copalibre/commit/18ae7f3a79686d2f8f69646e161c9a724ef083ef))
- **ci:** enable corepack before setup-node yarn cache probe ([e4ac13f](https://github.com/SebaSOFT/copalibre/commit/e4ac13fb81c824ea73cb7e73542e70bc1dc1238f))
- **ci:** exclude generated API contract from Prettier ([b0a1114](https://github.com/SebaSOFT/copalibre/commit/b0a1114326a76c5d84c5aab121548e3b788883d4))
- **ci:** fix CI-only failures — astro-check type errors and events' coverage gap ([8400d14](https://github.com/SebaSOFT/copalibre/commit/8400d146a839945817d9e9ff0b0860f29d883cdc))
- **ci:** map @copalibre/auth in the jest configs that import it ([baaaef2](https://github.com/SebaSOFT/copalibre/commit/baaaef257adae7d84b2a43f344ad63fa46390947))
- **ci:** map @copalibre/routing for apps/seed jest, run prettier ([3afb898](https://github.com/SebaSOFT/copalibre/commit/3afb8981eb36c34c7c71321c78d00f95ec62ffd0))
- **ci:** serve a real JWKS document for deployment-e2e/deploy-smoke-test ([1fe6507](https://github.com/SebaSOFT/copalibre/commit/1fe6507c0c7cc886629a1b25186d6dd6e3affe0f))
- **cli:** scaffold's git commit no longer depends on ambient git identity ([7e3adf1](https://github.com/SebaSOFT/copalibre/commit/7e3adf1d5898c27224818d78245a5b948f362e8c))
- **copalibre:** stop restore from requiring a host-side DATABASE_URL ([6e08628](https://github.com/SebaSOFT/copalibre/commit/6e0862895835a06c80885bc9b9ca1e0eadef40b8))
- **deps:** prefer real upgrades over resolutions where one exists ([71273ee](https://github.com/SebaSOFT/copalibre/commit/71273ee93c2b347e3fdeb73936cecb737b7f76f4))
- **deps:** resolve 7 of 9 open Dependabot high-severity alerts, mitigate the rest ([c997bf8](https://github.com/SebaSOFT/copalibre/commit/c997bf814a594d31138224960a7d7ed574ad46ff))
- **deps:** update yarn.lock for apps/api's new module-distribution dependency ([3ce466c](https://github.com/SebaSOFT/copalibre/commit/3ce466c8612173481f9e030353f53181c11b29f6))
- **domain:** a recorded event names its entrant, not a position ([9401d4b](https://github.com/SebaSOFT/copalibre/commit/9401d4b8481049f491fdd4bfa0566369450b4c58))
- **domain:** close descriptor/reference validation gaps; rename AliasScope ([73085b1](https://github.com/SebaSOFT/copalibre/commit/73085b17dd29626dea4ecc1fb8b414e4258e9404))
- **domain:** exclude test files from the library build ([c47980f](https://github.com/SebaSOFT/copalibre/commit/c47980fc7de46f73b6d83e280069a450c1ce8653))
- **domain:** freeze module version changes on archived tournaments ([cf2a367](https://github.com/SebaSOFT/copalibre/commit/cf2a367d321d7685bafbb975b51fe96429d1f4f1))
- **domain:** reject duplicate-entrant result corrections ([039e86f](https://github.com/SebaSOFT/copalibre/commit/039e86fc149f87b7996397918ff1d00d01106859))
- **domain:** validate bracket size and alias-suggestion length ([cfea01e](https://github.com/SebaSOFT/copalibre/commit/cfea01e3270008ed9d0ca6774ba87164d6ff9653))
- **e2e:** fix broken tsconfig extends resolution and two stale test bugs ([d8d9c74](https://github.com/SebaSOFT/copalibre/commit/d8d9c7428973065524fe6bd272f81a821ca8d304))
- **e2e:** match deployment-login spec's issuer to the JWKS stub ([ad932e1](https://github.com/SebaSOFT/copalibre/commit/ad932e19b7b29ae60c925c900166bd1739af6161))
- **e2e:** remove unused PUBLIC_TOURNAMENT_PATH variable to satisfy lint ([e042aa4](https://github.com/SebaSOFT/copalibre/commit/e042aa47e7258f81b77c7372e23194b3a6b49c72))
- **e2e:** resolve race condition in control login and remove api-dependent ssr spec ([736e36f](https://github.com/SebaSOFT/copalibre/commit/736e36f9acac6b8331899b2c873e6f51d9eaeacb))
- **e2e:** update help-site navigation spec for the new English default locale ([d3a5dad](https://github.com/SebaSOFT/copalibre/commit/d3a5dad2a17c40927e7d88c579438698c2133e99))
- **engine:** exclude integration specs from unit coverage collection ([56e1860](https://github.com/SebaSOFT/copalibre/commit/56e1860f30ea8ca26cb6e172e248c36574c98313))
- **engine:** isolate versioned descriptor fixtures ([8bd86d9](https://github.com/SebaSOFT/copalibre/commit/8bd86d91cfb68cd161f676a05514033b22db8864))
- **export:** escape CSV formula injection in free-text export cells ([7b1c8ff](https://github.com/SebaSOFT/copalibre/commit/7b1c8ffb72d6ba544703a720faf781da2e2575f2))
- **help:** vendor Scalar's bundle instead of loading it from a CDN ([92c6932](https://github.com/SebaSOFT/copalibre/commit/92c693291d202cee88c73a98e1097a47116ca81f))
- **jest:** map the rest of the unbuilt transitive workspace imports ([39136fa](https://github.com/SebaSOFT/copalibre/commit/39136fa8d4da69d4e4cf79f0f67759762fa3e0bb))
- **match-console:** persist monotonic projection versions ([f5b786c](https://github.com/SebaSOFT/copalibre/commit/f5b786cc6cd58153f9dbde664052e4c21cd78cb8))
- **openapi:** publish csv import export routes ([3186c21](https://github.com/SebaSOFT/copalibre/commit/3186c2180e6a6f22a4e4a6cda8ee1b849a2c399c))
- **persistence:** preserve empty abbreviation audit state ([7c0c74c](https://github.com/SebaSOFT/copalibre/commit/7c0c74cb5a21c143825896fc0e74db0e62e5a943))
- **persistence:** read match state within command transaction ([335db71](https://github.com/SebaSOFT/copalibre/commit/335db71690d1fea2c5c99a78d2f9e0346ff53e78))
- **persistence:** read pre-write state through the caller's transaction ([7e74873](https://github.com/SebaSOFT/copalibre/commit/7e74873ebd890fa1fd23518a315d474bf1eace1a))
- **persistence:** serialize implicit fixture scopes ([7658f54](https://github.com/SebaSOFT/copalibre/commit/7658f54b2ef8fb403211f821acc5d468207d84b1))
- **persistence:** use sql`now()` in relay.reEnqueue to fix flaky test ([4f44395](https://github.com/SebaSOFT/copalibre/commit/4f44395f5de7468bf18d4a388bd7b5ac563879c6))
- resolve CI coverage and accessibility test failures in auth routes ([ff6a180](https://github.com/SebaSOFT/copalibre/commit/ff6a18094ea1c9ea99a645b3e360c30345783fa6))
- resolve lint and typescript issues ([824f9a2](https://github.com/SebaSOFT/copalibre/commit/824f9a290826cc568352a17e4beda904e2388329))
- **routing:** correct stale comment about the removed alias re-export ([d0e6054](https://github.com/SebaSOFT/copalibre/commit/d0e60542ae62f16ca516aebd7e93a68192250a5b))
- **statistics-refold:** map @copalibre/rules to source in jest config ([84cce5d](https://github.com/SebaSOFT/copalibre/commit/84cce5d292f5a10294786d8a39d9ddc8e0092a99))
- **test:** isolate versioned module fixtures ([e8f7ffc](https://github.com/SebaSOFT/copalibre/commit/e8f7ffcf79635872675cc44f2a4c9fa3f2ed07df))
- **test:** restore root test discovery under ESM and guard it ([9f370ba](https://github.com/SebaSOFT/copalibre/commit/9f370ba415a927e0994bc6ba8372adccf3c62c49))
- **tournament-engine:** replace stray NUL bytes with spaces in map-key template literals ([0e594fb](https://github.com/SebaSOFT/copalibre/commit/0e594fbbff53d4f6be0880c61dab02c2b8992e7e)), closes [#106](https://github.com/SebaSOFT/copalibre/issues/106)
- **web:** add /health endpoint for SSR docker compose healthchecks ([5ea4ffb](https://github.com/SebaSOFT/copalibre/commit/5ea4ffb192d96cb3ce53c3a0c1b2ac68feeb57fc))
- **web:** capture occurredAt at button press, not workflow confirm ([1c7ea0d](https://github.com/SebaSOFT/copalibre/commit/1c7ea0d51b47447bb2e5618132191fa79866846d))
- **web:** cover RosterSelectionStep and fix stuck error state ([491f81d](https://github.com/SebaSOFT/copalibre/commit/491f81d64fedfd3cf490def7c0944a0ae906da48))
- **web:** drop the unused destructured binding the lint gate rejects ([470a368](https://github.com/SebaSOFT/copalibre/commit/470a368e15c91e2ca1104653f1e7f2f2961b2cd8))
- **web:** narrow the mutation-feedback union astro check reads more strictly ([c452740](https://github.com/SebaSOFT/copalibre/commit/c452740c34a54e8eb461d45c42d6127e5b39b7f8))
- **web:** properly resolve directory indexes in Caddy try_files for /control/ ([67417f0](https://github.com/SebaSOFT/copalibre/commit/67417f0e51a448efe851bee745271434b141b92b))
- **web:** satisfy astro check's stricter narrowing and Prettier formatting ([5024188](https://github.com/SebaSOFT/copalibre/commit/5024188c87b481e81edb334e904ec6e6684d192c))
- **web:** set HOST=0.0.0.0 to ensure Astro SSR binds to IPv4 for Docker healthcheck ([2ebc5d2](https://github.com/SebaSOFT/copalibre/commit/2ebc5d22e9e74037b49de75f84505c00b00bf933))
- **worker,scheduler:** add explicit @Inject() for tsx-compatible DI ([e79032a](https://github.com/SebaSOFT/copalibre/commit/e79032ab9a79ddf5aff2a988e3fd8e4fc6bc8979))
