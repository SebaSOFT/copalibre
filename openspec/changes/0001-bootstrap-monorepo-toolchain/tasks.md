## 1. Workspace and package manager

- [x] 1.1 Add root `package.json` with `"private": true`, `workspaces: ["apps/*", "packages/*"]`, and `packageManager` pinned to an exact Yarn 4 release
- [x] 1.2 Add `.yarnrc.yml` with `nodeLinker: node-modules`; confirm no `.pnp.*` files are generated
- [x] 1.3 Enable Corepack and commit `yarn.lock`
- [x] 1.4 Add root `.gitignore` entries for `node_modules/`, `.yarn/cache/`, `dist/`, `coverage/`, `playwright-report/`

## 2. Backend apps (NestJS CLI monorepo mode)

- [x] 2.1 Run `nest generate app api` — REST commands role
- [x] 2.2 Run `nest generate app events` — SSE role
- [x] 2.3 Run `nest generate app worker` — durable async jobs role
- [x] 2.4 Run `nest generate app scheduler` — job-enqueueing role
- [x] 2.5 Run `nest generate app migrate` — migration entrypoint role
- [x] 2.6 Run `nest generate app doctor` — diagnostics role
- [x] 2.7 Add `GET /health` (or process-exit-code equivalent for `migrate`/`doctor`) returning `{ role, version }` to each app
- [x] 2.8 Switch each app's platform adapter to `@nestjs/platform-fastify` per the architecture doc

## 3. Web app (Astro)

- [x] 3.1 Scaffold `apps/web` with Astro, empty public route (`/`)
- [x] 3.2 Add placeholder `/control` route mount point (no React app yet — phase 14 fills this in)
- [x] 3.3 Add placeholder `/help` route (phase 20 fills this in)
- [x] 3.4 Wire `@astrojs/react` integration (unused until phase 14, but configured now)

## 4. Shared packages

- [x] 4.1 Scaffold `packages/domain` with a placeholder `index.ts` and its own `package.json`/`tsconfig.json`
- [x] 4.2 Scaffold `packages/rules` (placeholder)
- [x] 4.3 Scaffold `packages/persistence` (placeholder)
- [x] 4.4 Scaffold `packages/contracts` (placeholder)
- [x] 4.5 Scaffold `packages/design-tokens` (placeholder)
- [x] 4.6 Scaffold `packages/routing` (placeholder)
- [x] 4.7 Add root `tsconfig.base.json` and per-workspace `tsconfig.json` extending it with project references so every `apps/*` can type-check against `packages/*` source directly

## 5. Lint and format gate

- [x] 5.1 Add root `eslint.config.js` (flat config) covering TypeScript, Astro, and React/TSX rule sets
- [x] 5.2 Add `.prettierrc` and `.prettierignore`
- [x] 5.3 Add root `yarn lint` script with `--max-warnings=0`
- [x] 5.4 Add root `yarn format` / `yarn format:check` scripts
- [x] 5.5 Add root `yarn typecheck` script running `tsc --build` across all project references

## 6. Unit tests (framework wiring only — no tests yet)

- [x] 6.1 Add root `jest.config.base.js` and per-package Jest configs (`ts-jest` or `@swc/jest`)
- [x] 6.2 Add root `yarn test` / `yarn test:coverage` scripts
- [x] 6.3 Verify `yarn test` exits 0 with "no tests found" on the placeholder packages

## 7. Integration tests (framework wiring only)

- [x] 7.1 Add `docker-compose.dev.yml` with a `postgres` service pinned to the target major version
- [x] 7.2 Document the `yarn test:integration` script convention (glob pattern, env var for `DATABASE_URL`) even though no integration tests exist yet — phase 4 is first to use it

## 8. E2E tests (framework wiring only)

- [x] 8.1 Add root `playwright.config.ts` targeting `apps/web`, `webServer` auto-starting `yarn dev --filter web`
- [x] 8.2 Add `yarn test:e2e` script
- [x] 8.3 Verify `yarn test:e2e` runs (and reports zero specs) against the placeholder Astro shell

## 9. OpenSpec tooling

- [x] 9.1 Confirm `openspec/config.yaml` project context and per-artifact rules are committed
- [x] 9.2 Commit `openspec/changes/README.md` roadmap index (tracked separately, see repo-wide roadmap task)

## 10. License compliance scaffolding

- [x] 10.1 Seed `THIRD_PARTY_NOTICES.md` with a header explaining the AGPL project / MIT-dependency policy from `copalibre-platform-architecture.md` §"License and AGPL policy"
- [x] 10.2 Add a license-scanning CLI (e.g. `license-checker`) as a dev dependency with an SPDX allowlist (MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC)
- [x] 10.3 Add `yarn license:check` script

## 11. CI wiring

- [x] 11.1 Create `.github/workflows/ci.yml` triggered on `pull_request` and `push` to `main`, with concurrency-cancel per ref
- [x] 11.2 Add `install` job: checkout, Corepack enable, `yarn install --immutable`
- [x] 11.3 Add `lint` job (needs `install`): `yarn lint`
- [x] 11.4 Add `typecheck` job (needs `install`): `yarn typecheck`
- [x] 11.5 Add `license-scan` job (needs `install`): `yarn license:check`
- [x] 11.6 Add `.github/pull_request_template.md` requiring lint/typecheck/license-scan green before review
- [x] 11.7 Confirm all four CI jobs (`install`, `lint`, `typecheck`, `license-scan`) pass on this change's own branch — this is the CI pipeline every later phase's tasks.md will extend with new jobs/steps, starting from `.github/workflows/ci.yml` created here
