# Repository Guidelines

## Scope and Structure

CopaLibre is a Yarn 4 TypeScript monorepo for tournament operations. Run commands from this directory. Applications live in `apps/` (`api`, `web`, `events`, workers); reusable domain and infrastructure code lives in `packages/`; operational decisions and implementation plans live in `openspec/`.

Read the active OpenSpec change before editing. Use `openspec validate <change> --strict` after updating its artifacts. Completed changes are synced and archived only after implementation and verification are complete.

## Commands

```bash
yarn install --immutable
yarn typecheck
yarn lint
yarn test
yarn test:integration
yarn test:e2e
yarn workspace @copalibre/api run openapi:generate
yarn workspace @copalibre/contracts run generate
yarn workspace @copalibre/web verify:docs
yarn test:e2e e2e/help-and-api-reference.spec.ts
yarn workspace @copalibre/seed test:sqlite
yarn test:verify-discovery
```

Use focused commands while iterating, for example `yarn workspace @copalibre/web test --testPathPatterns 'match-console'`. Integration tests use PostgreSQL through `DATABASE_URL`; `yarn workspace @copalibre/persistence test:sqlite` is portable fast feedback, not replacement for PostgreSQL behavior. Before pushing, run `yarn workspace @copalibre/<workspace> test:coverage` for every touched workspace. Root `yarn test` does not enforce CI coverage thresholds.

### Running the gate suite without flooding context

`rtk`'s shell hook rewrites git/gh/jest/tsc/eslint/playwright, but there is **no `yarn` subcommand** — and every gate here runs through a Yarn script, so none of them are filtered automatically. Use these forms:

```bash
rtk err yarn lint                 # errors/warnings only
rtk err yarn format:check
rtk err yarn typecheck            # grouped tsc errors; silent when clean
rtk test yarn test                # last 5 lines: the pass/fail summary
rtk test yarn test:integration
rtk test yarn test:e2e
rtk proxy yarn <script>           # unfiltered, when filtered output looks wrong
```

**Coverage is the exception — never wrap it.** `rtk test` prints only the final 5 lines, and Jest prints its threshold verdict _above_ the `Test Suites:` summary, so a coverage failure is invisible through that window (and through any `tail -5`). Jest still exits 0 locally, so the failure surfaces only as CI's "Unit tests" job. Grep for the verdict explicitly:

```bash
yarn workspace @copalibre/<workspace> test:coverage 2>&1 | grep -E "does not meet|Tests:"
```

**Change-risk (CRAP) score** (`scripts/check-crap-score.mjs`, run via `yarn crap:check`) reads each
workspace's `coverage-final.json` and fails on a function that is both complex and undertested —
`complexity^2 * (1 - coverage)^3 + complexity` above 30. It only sees coverage output that already
exists, so run the relevant `yarn workspace @copalibre/<workspace> test:coverage` first. Existing debt
is grandfathered in the `KNOWN_CRAP` register inside the script (same ratchet pattern as
`KNOWN_HARDCODED` in `scripts/check-ui-text-catalogue-coverage.mjs`): a recorded score may only fall,
never rise, and a new function above threshold that isn't registered fails outright. CI runs it as the
last step of each `unit-tests-group` matrix leg in `.github/workflows/ci.yml`.

`@copalibre/web` sits a fraction of a point over its 85% branch threshold, so almost any new UI code trips it; budget tests for the branches a change adds rather than discovering it in CI.

**Never run a build-producing suite alongside the e2e suite.** `apps/web/src/help-static.integration.test.ts` shells out to `verify:docs`, which runs `astro build` into `apps/web/dist` — the same directory Playwright's `webServer` builds and then serves. Running `yarn test:integration` (or anything else that builds `apps/web`) while `yarn test:e2e` is in flight races two builds into one output directory, and the result is an SSR manifest pointing at a chunk that no longer exists:

```
ERR_MODULE_NOT_FOUND … dist/server/chunks/_organization__<hash>.mjs
```

What that looks like from the test side is not a build error. It is a login page with no email field, a `page.goto` timeout, an emblem that never renders — failures that read as application defects and send you looking in the wrong place. Run the e2e suite on its own, and `rm -rf apps/web/dist` first if a previous run was interrupted.

**Generated CSS is a build artifact, not a source file.** `packages/design-tokens/generated/copalibre.css` is `.gitignore`d, and every page in `apps/web` imports it directly, so an out-of-date copy serves stale rules rather than failing: a change to `generate/css.ts` then appears to have no effect in the browser. `apps/web`'s `dev` and `build` scripts regenerate it, so a plain `yarn workspace @copalibre/web build` — including the one Playwright's `webServer` runs — is always current. Regenerate it by hand only when running something that bypasses that build:

```bash
yarn workspace @copalibre/design-tokens build:tokens
```

A design-tokens unit test compares the file on disk against `generateCss()` and names this command when they differ, so a stale artifact fails a test instead of quietly rendering last week's stylesheet.

**Design tokens drift and verified documentation.** `DESIGN.md`'s verified token frontmatter is checked against the token source in `tokens.test.ts`. Refresh verified frontmatter in the same PR when token primitives change:

```bash
yarn workspace @copalibre/design-tokens refresh:design
```

Full descriptive documentation and `.impeccable/design.json` sidecar refresh (`/impeccable document`) follows integration and lands on the next feature branch. The normative-source note under `DESIGN.md`'s H1 is preserved by the refresh mechanism.

**Mechanical design checks.** Run Impeccable detector checks locally:

```bash
npx impeccable detect
```

Suppression justifications are recorded in `.impeccable/config.json`.

### The component workbench

`yarn workspace @copalibre/web storybook` starts Storybook on port 6006 with every owned library
component, the public and TV components, and the generated token style guide. It is a **local review
surface**: there is no `build-storybook` script and nothing is hosted, so what it shows is always the
checked-out branch. It is not built in CI — nothing automated consumes it.

Stories are grouped by surface first (`Admin/`, `Public/`, `TV/`, `Tokens/`) and the library by tier
(`Admin/Atoms`, `Admin/Molecules`, `Admin/Organisms`, `Admin/Templates`), because a component's
surface decides what "correct" looks like. Each library component has a `Playground` with every prop
adjustable and a `Matrix` putting its variants side by side.

Use the workbench toolbar controls during UI review:

- **Language** — all eight supported languages, rendered from the application's own catalogues. Story
  text comes from real message descriptors (`ui/story-text.ts`), never literals, so switching to
  German or Russian shows what a real translation does to the layout. A component whose text is
  hardcoded stays English under every selection, which is how the workbench makes that visible.
- **Viewport** — 1440px, the 767px and 374px breakpoints `control.css` declares, and the **188px**
  zoom floor the token generator names as its narrowest reference. German at 188px is the worst case
  for nearly every component, and it is one selection away rather than a build.
- **TV background** — story default, neutral, green chroma, bright football field or dark basketball
  court. Bundled images are preview-only; switching backgrounds leaves discipline, match data and
  layout mode intact. Opaque kiosk panels still cover the backdrop.

A top-level **Reference index** story lists every supplied reference, the story that renders it, and
the production surface consuming it. A row with an empty consumer column is a finding, not an
omission: `apps/web/src/reference-index.test.ts` fails if a listed consumer path does not exist, if a
listed story title is not declared by any stories file, or if an unconsumed row carries no
explanation. Start a UI review there rather than by browsing the sidebar.

Visual review here is a person's job by design: there are no screenshot baselines and no diffing
service. The only automated rule is coverage — `scripts/check-ui-ownership.mjs` fails when an
owned library component has no sibling `*.stories.tsx`, and derives the list from the tier
directories so a newly added component is covered without the check being edited.

Operator screens live under `Admin/Screens`, beside their source as `*.stories.tsx`. Use `Loaded`,
`Empty`, `Loading`, and `Failed` for supported states and descriptive names for workflow states.
`screen-story-fixtures.ts` shares identities and typed data, not a comprehensive mock API. Each
screen declares its own narrow client; an undeclared method throws, while optional capabilities
must be explicitly absent. Do not replace production UI with a Storybook-only layout.

Screen coverage is derived dynamically from the filesystem: `scripts/check-ui-ownership.mjs`
recursively walks `apps/web/src` across operator, public and TV React surfaces, including nested
library tiers and `control/i18n`. Each React surface requires a sibling `*.stories.tsx`, excluding
only the declared non-screen categories (routers, providers, fixtures, and deferred). Explicit
router/provider/deferred exclusions use paths relative to `apps/web/src`; a page stays exempt by
tier, not by file type — an Astro **page** carries no story requirement because
`check-atomic-composition.mjs` holds the page tier accountable for its own presentation instead, but
an Astro **library** component (atom/molecule/organism/template) is not exempt: it needs a story or,
since Storybook cannot render `.astro`, an entry in the preview seam below. See
`docs/SCREEN-STORY-REVIEW.md` for fixture boundaries and review findings,
`docs/reviews/0222-owned-control-coverage.md` for the current coverage and background review, and
`docs/reviews/0223-operational-surface-compositions.md` for the composition parity pass — including
what that pass deliberately leaves unreviewed.

The preview seam, `apps/web/src/preview/AstroPreview.astro` (dev-server only; 404s outside `DEV`),
renders a real `.astro` library component through the real Astro renderer at `/__preview/<id>`,
framed from Storybook by `components/ui/AstroPreview.tsx`. It exists because Storybook has no Astro
renderer — re-creating a server-rendered component's markup in React would only prove an imitation
agrees with itself. `PREVIEWABLE` is an allowlisted id set, not an arbitrary-markup endpoint; adding a
component means adding its id and a render branch with reference-fixture props (`lib/reference-fixtures.ts`).

### The five tiers, and the two scripts that enforce them

Every UI surface belongs to one of five tiers — **Atom → Molecule → Organism → Template → Page** —
and the tier decides what a file may compose and what it must not do itself:

| Tier     | What it is                                                                         | Where it lives                                                                                                                                                                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Atom     | The smallest owned primitive (a button, a badge, an image frame)                   | `control/components/ui/atoms/`, `components/ui/atoms/`                                                                                                                                                                                                                                 |
| Molecule | A few atoms composed with no data access of its own                                | `control/components/ui/molecules/`, `components/ui/molecules/`                                                                                                                                                                                                                         |
| Organism | A larger composition, still presentation-only                                      | `control/components/ui/organisms/`, `components/ui/organisms/`, `components/tv/ui/organisms/`                                                                                                                                                                                          |
| Template | The screen's structural shape — layout only, no fetching                           | `control/components/ui/layouts/` (`ListScreenLayout`, `FormScreenLayout`, `AuthScreenLayout`, `MatchConsoleLayout`); a template's own JSX/props half of a screen also lives as `*Template.tsx` beside its `*Page.tsx` in `control/components/screens/` and `control/components/pages/` |
| Page     | Owns the API client, every fetch/mutation, and composes a Template with the result | `control/components/pages/`, `apps/web/src/pages/` (Astro routes)                                                                                                                                                                                                                      |

**Two scripts enforce this, each with its own registers — do not conflate them:**

- **`scripts/check-ui-ownership.mjs`** asks _does this file compose the owned library instead of
  reinventing it?_ It flags a raw element the library replaces (`dialog`, `table`, `textarea`,
  `button`, `input`, `select`, plus form-structure and table-part tags), a hand-written class an
  owned component already applies (`cl-card`, `cl-badge`, `cl-btn`, `cl-data-table`), and missing
  story/preview coverage. Its debt lives in `KNOWN_RAW_ELEMENTS` and `KNOWN_HANDWRITTEN_CLASSES`.
- **`scripts/check-atomic-composition.mjs`** asks _is this file honoring its own tier's contract?_
  (rules R1–R13: a tier importing above itself, inline layout below the template tier, a raw CSS
  value outside the token layer, data access below the page tier, literal text outside the message
  catalogue, an orphaned library member, and more). Its debt lives in nine separate registers
  (`KNOWN_UNDECLARED_TIER`, `KNOWN_INLINE_LAYOUT`, `KNOWN_RAW_STYLE_VALUES`,
  `KNOWN_DATA_BELOW_PAGE`, `KNOWN_ORPHANS`, `KNOWN_DUPLICATE_NAMES`, `KNOWN_MULTI_ATOM_OWNERSHIP`,
  `KNOWN_LITERAL_TEXT`, plus the currently-empty `KNOWN_UPWARD_IMPORTS`/`KNOWN_I18N_BELOW_ORGANISM`/
  `KNOWN_CASING_VIOLATIONS`/`KNOWN_CATALOGUE_GAPS`/`KNOWN_BANNED_ORNAMENT`), one per rule, because a
  file can carry unrelated debt against more than one rule at once.

**Ownership is a directory only for the atom tier.** A file inside `ui/atoms` _defines_ the design
language; nothing else gets that exemption merely for sharing a `ui/` parent. A molecule, organism,
or template under `ui/` is governed exactly like a file outside it — the handful that genuinely
_are_ a primitive's own definition (`DataTable.astro`/`data-table.tsx`, `Modal.astro`,
`field-set.tsx`, the TV surface's `TvStandingsTable.tsx`) are named individually in
`check-ui-ownership.mjs`'s owner-file sets, not exempted by directory. That holds identically for
`control/components/ui` (the React library) and `components/ui`/`components/tv/ui` (the
server-rendered public and broadcast primitives). A new primitive goes in a `ui/atoms` directory;
nothing else needs telling.

Every register keys on the **path** relative to `apps/web/src`, never the file name —
`index.astro`, `[match].astro`, `[tournament].astro` and `emblem.ts` each exist more than once. A
count may only go down: adding a violation to a listed file fails, so does adding one to an unlisted
file, and _removing_ one fails until the recorded number is lowered. Delete an entry at zero. A file
recorded as debt always carries a stated reason in a comment above its entry — a genuine library gap
(no atom exists yet for the shape), a deferred adoption (the owned component can't yet express what
the raw markup does, e.g. a per-row link `DataTable`'s `render` callback can't produce), or
historical debt from before the rule existed. None of it is a blanket exemption: the same rule
applies to every surface, and a file's entry names exactly what it owes.

Yarn must use the conventional `node-modules` linker with the global cache. Do not enable PnP or Zero-Installs, and do not commit Yarn cache artifacts. Workspace scripts that execute a root development tool should follow the existing explicit `../../node_modules/.bin/<tool>` pattern when Yarn does not expose the hoisted binary.

## Code and Architecture

Use TypeScript with Prettier and ESLint. Follow existing two-space indentation, single quotes, semicolons, camelCase values, PascalCase components/classes, and nearby file naming conventions. Keep domain code framework-free: `packages/domain` and `packages/rules` must not import NestJS or Fastify.

Before editing an existing source file, use CodeGraph to locate the relevant symbol and read the exact current block, including imports and decorators. Prefer CodeGraph over grep, find, or sed for exploring or locating code generally, not only immediately before an edit — one `codegraph_explore` call typically returns verbatim source, call paths, and blast radius together, at a fraction of the round-trips a grep/read loop costs. Fall back to grep/find/sed only for what CodeGraph genuinely cannot answer. After every patch, inspect its focused `git diff` before compiling or testing; do not rely on a partial patch context to infer surrounding code.

Before adding a new domain primitive or abstraction, check whether an existing declarative mechanism already generalizes to the need — an `EventEffect`/`TargetAttribution` variant, a `ColumnSource` kind, an `ActorGranularity`/`CompetitionGranularity` value, an `EventWorkflow` branch. This codebase's mechanisms are frequently more general than any one discipline currently exercises; extending one at a setting it already supports is usually the right-sized change, not a new type.

Preserve system traceability. Mutations that affect tournament state require explicit authorization, audit records, and durable outbox events in the same transaction. Model sport behavior through `DisciplineDescriptor` data and rules; do not hardcode sport-specific UI or controller logic. Prefer UUIDs for identifiers and do not expose personal data unnecessarily.

This pillar governs interaction design, not just data modeling: a live-operations surface (e.g., the Live Match Operations Console's event recording) must render each discipline's own one-tap event flows from its `DisciplineDescriptor` config — never ship one sport's example (e.g., football's goal/foul/offside) as the hardcoded flow for every discipline. Any sport-specific example given during design work (football, basketball, etc.) is illustrative of the _pattern_ the config-driven engine must support, not the target sport to build for.

Versioned first-party modules are JSON from `packages/module-catalogue/`, installed only through `apps/seed`; migrations and application startup never seed them. SQLite integration parsing must preserve `{{ ... }}` rule expressions as strings rather than treating them as nested JSON.

## Domain Language and Data Evolution

Use `roster` only for selected players of one entrant in one match. Use `team membership` for a persistent person-team relation; never use roster or lineup for it.

Term migrations that rename tables, capabilities, or wire fields must provide reversible `up` and `down` paths. Preserve historical migrations as written, add compatibility coverage in PostgreSQL and SQLite, and verify persisted rows and capabilities survive both directions.

## Tests and Contracts

Add `*.test.ts(x)` beside unit-tested code and `*.integration.test.ts` for database or HTTP behavior. Test server-side authorization and validation even when the UI hides controls. A decorated controller must be registered in `AppModule`, listed in `OPENAPI_CONTROLLERS`, and declare schemas for every 2xx response; regenerate and commit `packages/contracts/openapi/v1.json` and generated types afterward. Fixtures must use lowercase kebab-case aliases and UUIDv7 opaque IDs; URL encoding never makes an invalid alias valid. For intentional incompatible API changes, bump `OPENAPI_VERSION`'s major version and generate with explicit breaking-change acceptance.

## Help and API Reference

Keep Starlight, Pagefind, and Scalar dependencies pinned. `prefetch: false` in the Astro config is
intentional: Starlight otherwise injects prefetch JavaScript into public broadcast pages, which must
remain complete without JavaScript. Any docs dependency or ClientRouter lifecycle change requires
`yarn workspace @copalibre/web verify:docs` and the focused help Playwright spec.

The API reference reads the reviewed same-origin `/openapi/v1.json` artifact; it must never fetch a
live API document. Its Scalar route deliberately forces a full document load and keeps request
execution, authentication, client generation, telemetry, developer tools, and downloads disabled.

## CI and Infrastructure

Modifying cross-cutting infrastructure files (`docker-compose.yml`, `Dockerfile`, Helm chart in `deploy/helm/`) or other global configuration has cascading effects that are validated by custom repository scripts in `scripts/`. Do not assume an infrastructure change is isolated.

`.github/workflows/ci.yml`'s job ids, if you need to find a failing check directly: `detect-changes`, `guard-coverage`, `license-scan`, `enterprise-readiness-doc-lint` (runs the infra-validation scripts named below), `module-validation`, `third-party-notices`, `contract-tests`, `openapi-contract-lint`, `deploy-smoke-test`.
Before creating or updating a PR, you MUST guarantee the CI will pass by running the baseline monorepo validations locally:

- `yarn lint`
- `yarn format:check`
- `yarn typecheck`
- `yarn test` and/or `yarn test:integration` (for backend)
- `yarn test:e2e` (for frontend)

Crucially, if you modify **any** infrastructure or deployment file, you MUST explicitly run the repository's custom validation scripts locally before committing:

- `node scripts/check-helm-compose-parity.mjs`
- `node scripts/check-enterprise-readiness-docs.mjs`
- `node scripts/check-third-party-notices.mjs`

## Changes and Reviews

Use scoped Conventional Commit subjects, such as `feat(api): add match projection` or `fix(persistence): preserve elapsed clock`. Keep commits narrowly focused. PRs must describe behavior, OpenSpec change ID, tests run, migration/configuration impact, and screenshots for UI changes. Git ignore rules are authoritative: never force-add anything under `openspec/changes/`, whether active or archived. Commit only accepted specification deltas under `openspec/specs/`. Never commit `.env` files, credentials, or production connection strings.

## Tooling Reference

Concrete usage notes for the tools this project's workflow depends on. See `.claude/skills/*/SKILL.md`
for the full skill instructions; this section is the quick-reference cheat sheet.

### CodeGraph (MCP: `codegraph_explore`, CLI: `codegraph explore "..."`)

- `.codegraph/codegraph.db` is a pre-built SQLite index of every symbol/edge/file in this monorepo
  (30+ languages, TS/JS included). It lags file writes by ~1s via a watcher.
- One tool, `codegraph_explore`. Pass either symbol/file names or a natural-language question. Returns
  verbatim line-numbered source (safe to `Edit` from directly, same shape as `Read`), the call graph
  between the returned symbols (including dynamic-dispatch hops like callbacks/JSX that grep misses),
  and a blast-radius summary of callers/tests.
- Use it **before** Read/Grep/Find for "how does X work," "where is X defined," locating a symbol before
  editing, or checking what depends on something before changing it. Fall back to grep/find/Read only for
  what CodeGraph can't answer (e.g. a known line range in a file you already have open).
- A `UserPromptSubmit` hook auto-surfaces matching indexed symbols for each prompt — treat those as
  already-read context and query `codegraph_explore` once with the relevant names rather than re-deriving
  them by hand.

### rtk (Rust Token Killer)

- Token-optimized proxy CLI (`rtk <subcommand>`) that filters/compacts output before it reaches context —
  git, gh, glab, docker, kubectl, psql, pnpm/npm/npx, jest/vitest/playwright, tsc, eslint, prettier, aws,
  and more (`rtk --help` lists ~50 subcommands).
- A shell hook transparently rewrites plain commands (`git status` → `rtk git status`) — no manual
  invocation needed for day-to-day git/gh/test/lint calls; 0 token overhead to the rewrite itself.
  It has no `yarn` subcommand, so this repo's Yarn-script gates are **not** rewritten; see
  ["Running the gate suite without flooding context"](#running-the-gate-suite-without-flooding-context).
- Useful direct invocations: `rtk gain` (savings analytics), `rtk gain --history`, `rtk discover` (finds
  missed savings opportunities in session history), `rtk proxy <cmd>` (bypass filtering to debug a raw
  command that looks wrong when filtered), `rtk err` / `rtk test` (show only failures/warnings from a
  command's output).
- Verify a working install with `rtk --version` and `rtk gain`; `rtk gain` failing (vs. "command not
  found") usually means a name-colliding `rtk` (Rust Type Kit) is on `PATH` instead.

### Tavily CLI (`tvly`) — web operations

- Replaces built-in WebFetch/WebSearch for anything involving a URL: `tvly search`, `tvly extract <url>`,
  `tvly crawl <url>`, `tvly map <url>` (URL discovery, no content), `tvly research run/status/poll` (deep
  research jobs). `--json` for machine-readable output.
- Auth: `tvly login --api-key tvly-...` or `TAVILY_API_KEY` env var; `tvly auth` checks status.
- Use for reading current docs (e.g. dependency upgrade notes), checking a GitHub Actions marketplace
  action's current inputs, or any "look this up online" request — never guess at API/library behavior
  that a fetch would settle.

### feature-delivery skill

- SebaSOFT's cross-project shipping protocol (`.claude/skills/feature-delivery/SKILL.md`): investigate
  with CodeGraph first, plan with OpenSpec, one change per branch, verify locally before opening a PR,
  wait for explicit human merge approval (never self-merge), then archive the change and promote its spec
  deltas.
  Concrete per-project specifics (branch naming, gate suite, promotion mechanics) live in this file's
  ["Feature Delivery Pipeline"](#feature-delivery-pipeline) section below — the skill explicitly defers to
  that.
- Key behavioral rules worth remembering: design docs get an explicit Non-Goals list; prefer extending an
  existing declarative mechanism over inventing a new domain primitive; ask (`AskUserQuestion`) only for
  genuine product/privacy/scope decisions, never for things answerable by reading code; one OpenSpec
  change per branch/PR, never batched.

### OpenSpec CLI (`openspec`)

- `openspec/` holds `changes/` (in-flight proposals) and `specs/` (accepted baseline), configured via
  `openspec/config.yaml`.
- Core commands used in this repo's cycle: `openspec change show <id>`, `openspec validate <id>
--strict` (required before considering a proposal or its updates done), `openspec archive <id> --yes`
  (after merge), `openspec spec show/list/validate`, `openspec list` (active changes), `openspec view`
  (interactive dashboard), `openspec status <change>` (artifact completion), `openspec context` (working
  context for the resolved root).
- The dedicated skills (`openspec-propose`, `openspec-apply-change`, `openspec-explore`,
  `openspec-update-change`, `openspec-sync-specs`, `openspec-archive-change`, and their `opsx:*`
  equivalents) wrap these commands for the propose → implement → archive/promote lifecycle described in
  Feature Delivery Pipeline below.

### git and GitHub CLI (`git`, `gh`)

- Standard `git`; `rtk git <subcommand>` (status/diff/log/show/add/commit/push/pull/branch/fetch/stash/
  worktree) gives compact output and is what the shell hook substitutes automatically.
- `gh` (v2.98+) for PRs/issues/runs/repo: `gh pr create/view/checks`, `gh issue`, `gh run`, `gh api` for
  anything not covered by a subcommand. `rtk gh <pr|issue|run|repo>` gives the same token-optimized
  wrapping.
- This repo's remote is `github.com/SebaSOFT/copalibre`. Branch/commit/PR conventions (Conventional
  Commits, `change/00NN-slug` branch naming, PR description contents, never force-adding
  `openspec/changes/`) are covered under "Changes and Reviews" and "Feature Delivery Pipeline" above —
  this entry is only the tool-invocation reference.

### agent-browser CLI

- Browser automation CLI for AI agents (`agent-browser <command>`), installed via the Node toolchain
  (`~/.nvm/.../bin/agent-browser`, v0.34+).
- Start with `agent-browser skills get core --full` for the full workflow/selector reference rather than
  guessing from flags — the CLI ships its own skill docs, version-matched to the binary. Specialized
  skills exist for Electron apps, Slack, exploratory testing, and cloud browser providers
  (`agent-browser skills list`).
- Core verbs: `open <url>`, `read [url]` (agent-readable text extraction), `click`/`type`/`fill`/`press`
  by selector or `@ref`, `snapshot` (accessibility tree with refs, the primary way an agent finds
  elements), `screenshot`/`pdf`, `eval <js>`, `get <what>`/`is <what>` for state, `connect <port|url>` to
  attach via CDP.
- Use this for the "start the dev server and use the feature in a browser before reporting complete" step
  required for UI/frontend changes (see Code and Architecture guidance above), not just ad hoc scraping.

## Feature Delivery Pipeline

Follow the `feature-delivery` skill for the full shape of shipping a change. The concrete cycle in this
repo: one OpenSpec change per branch, named `change/00NN-slug`, branched from `develop`. Implement its
tasks, then run the full local gate suite (`yarn lint`, `yarn format:check`, `yarn typecheck`, `yarn test`/`yarn
test:integration`, `yarn test:e2e` as applicable, plus the infra validation scripts above if
infrastructure files changed) and confirm every one is green before opening a PR against `develop`. Wait
for every required CI check to pass, then wait for explicit merge approval — do not merge a PR on your
own initiative, and an earlier approval does not carry forward to the next PR. Once merged, sync
`develop`, delete the local and remote feature branches, then archive the change with
`openspec archive <change> --yes`. Git ignore rules are authoritative: never force-add active or archived
change artifacts. Keep resulting accepted-spec deltas uncommitted on `develop`; on the next feature
branch, commit only those `openspec/specs/` deltas first
(`docs(openspec): promote NNNN specs into the accepted baseline`). Do not create a standalone PR for
promotion. Only then implement the next queued change, unless told to work ahead.
