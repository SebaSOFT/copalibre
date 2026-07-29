## Why

CopaLibre's repository currently contains only `README.md`, `LICENSE`, `.gitattributes`, and
`.gitignore` — no application code, no workspace tooling, no CI. Every subsequent phase (domain
model, persistence, API, both frontends, deployment) depends on a working monorepo skeleton: the
`apps/`/`packages/` layout, package manager, TypeScript project wiring, lint/format gate, base test
runners, and a CI pipeline that can already fail a pull request on style/type errors before any real
feature code exists. This phase exists so every later phase's `tasks.md` can assume `yarn install`,
`yarn lint`, `yarn typecheck`, and a green CI check already work, rather than re-deriving toolchain
setup piecemeal in each feature phase.

The concrete layout and package-manager rules are already decided in
`../chaos-vault/20-knowledge-domains/copalibre-platform-architecture.md` ("Backend, runtime, and
package management" and "Development and installation contract" sections) and
`../chaos-vault/30-processes/decisions/2026-07-28-copalibre-platform-architecture.md`
("Backend runtime and packages"). This proposal does not choose new architecture; it stands up the
skeleton those decisions already specify.

## What Changes

- Initialize a **Yarn 4 (stable line) workspace** via Corepack, `nodeLinker: node-modules`, no PnP,
  no Zero-Installs, `packageManager` pinned to an exact release, `yarn.lock` committed,
  `yarn install --immutable` required in CI.
- Scaffold the **NestJS CLI monorepo** (`nest generate app` per role) for
  `apps/api`, `apps/events`, `apps/worker`, `apps/scheduler`, `apps/migrate`, `apps/doctor`, each
  with only a stub health endpoint (`GET /health` returning process-role + version) — no business
  logic yet.
- Scaffold `apps/web` as an **Astro** app (empty public route + placeholder `/control` React island
  mount point + placeholder `/help` route), matching the "Consolidated web, help, and API reference"
  section of the architecture doc.
- Create empty-but-wired `packages/domain`, `packages/rules`, `packages/persistence`,
  `packages/contracts`, `packages/design-tokens`, `packages/routing` workspace packages (one
  `index.ts` placeholder + `package.json` + `tsconfig.json` each) so later phases only add code, not
  wiring.
- Add root **TypeScript** project references tying all `apps/*` and `packages/*` together.
- Add **ESLint (flat config) + Prettier** at the repo root with a zero-warnings policy
  (`--max-warnings=0`), covering NestJS (TS), Astro, and React/TSX rule sets.
- Add a root **Jest** config plus one per-package config (`ts-jest`/`swc`), and a root **Playwright**
  config pointed at `apps/web` with no specs yet.
- Add a **Docker Compose** development profile (`docker-compose.dev.yml`) that starts PostgreSQL
  only — no app containers yet, since no app has real behavior.
- Run `openspec init` in this repository (this phase's own tooling — already done as of this
  proposal) and commit the resulting `openspec/` structure.
- Add the base **GitHub Actions** workflow `.github/workflows/ci.yml` with `install` (Corepack +
  `yarn install --immutable`), `lint`, and `typecheck` jobs only — no test/build/deploy jobs yet,
  since there is nothing to test or deploy.
- Add a dependency **license-scan CI job stub** (e.g. `license-checker` or `yarn licenses list`
  gated to an allowlist) to start enforcing the AGPL/MIT third-party-notice policy from day one.
- Add a PR template requiring lint, typecheck, and (once they exist) test gates to be green.

## Capabilities

### New Capabilities
- `monorepo-toolchain`: the repository provides a Yarn 4 workspace with the documented
  `apps/`/`packages/` layout, TypeScript project references, ESLint+Prettier zero-warnings gate,
  base Jest/Playwright configuration, a Docker Compose development profile, and a CI pipeline that
  enforces install/lint/typecheck and a dependency license scan on every pull request.

### Modified Capabilities
(none — this is the first change in the repository)

## Impact

- **New files/dirs**: `package.json` (root, workspaces), `.yarnrc.yml`, `apps/{api,events,worker,
  scheduler,migrate,doctor,web}/`, `packages/{domain,rules,persistence,contracts,design-tokens,
  routing}/`, `tsconfig.base.json` + per-package `tsconfig.json`, `eslint.config.js`,
  `.prettierrc`, `jest.config.base.js` + per-package configs, `playwright.config.ts`,
  `docker-compose.dev.yml`, `.github/workflows/ci.yml`, `.github/pull_request_template.md`,
  `THIRD_PARTY_NOTICES.md` (seeded empty).
- **Dependencies introduced**: `typescript`, `@nestjs/*` (core, platform-fastify, cli), `astro`,
  `eslint` + plugins (`@typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-astro`),
  `prettier`, `jest` + `ts-jest`/`@swc/jest`, `@playwright/test`, a license-scanning CLI.
- **Nothing runtime-facing changes** — no database schema, no API surface, no deployable behavior.
  This phase only unblocks every later phase listed in the roadmap
  (`openspec/changes/README.md`).
