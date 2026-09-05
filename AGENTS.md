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
