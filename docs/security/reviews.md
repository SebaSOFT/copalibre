# Security reviews

Evidence for the gate's attestations. An attestation in `attestations.json` points here; the owner
records it after reading the review.

## Unused dependencies, 2026-11-10

Analyzer: knip 6.45.0, `--dependencies`, run locally over every workspace. Each candidate was
checked for dynamic imports, configuration strings, build scripts and binary packaging before
anything was removed.

**Removed, no use found:**

| Workspace              | Dependency                              |
| ---------------------- | --------------------------------------- |
| `apps/events`          | `jose`, `supertest`, `@types/supertest` |
| `apps/api`             | `supertest`, `@types/supertest`         |
| `apps/scheduler`       | `@copalibre/domain`                     |
| `apps/worker`          | `@copalibre/tournament-engine`          |
| `packages/persistence` | `@copalibre/routing`                    |

`argon2` moved from `packages/auth`, which never imported it, to `apps/api`, which does.

**Kept, used in a way the analyzer does not see:**

| Workspace                       | Dependency                                                                   | Use                                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `packages/design-tokens`        | the `@fontsource` packages                                                   | font file paths in `primitives.ts`                                                                                 |
| `packages/demo-datasets`        | `@imgly/background-removal`, `onnxruntime-web`, `esbuild`, `playwright-core` | the cutout browser script                                                                                          |
| `apps/copalibre`                | `postject`                                                                   | `scripts/build-binary.mjs`                                                                                         |
| `apps/web`                      | `jsdom`, `@testing-library/jest-dom`                                         | Jest environment and setup file                                                                                    |
| root                            | `@lhci/cli`, `lighthouse`, `puppeteer-core`                                  | `scripts/lighthouse/`, run by CI                                                                                   |
| `apps/scheduler`, `apps/worker` | `@nestjs/testing`                                                            | `scripts/nestjs-major-alignment.test.mjs` requires every NestJS app to declare it, so all resolve one NestJS major |
| `apps/web`                      | `cookie` 2.0.1                                                               | Pins the version Astro's prerenderer imports `parseCookie` from; without it the Docker web build fails             |

**Not addressed here:** knip also lists 268 imports of packages a workspace does not declare,
mostly `kysely` and `fastify`, which resolve through the workspace root. They are not unused
packages; declaring them is a separate cleanup.

After the removals: typecheck, unit tests, license check, third-party notices, the registry audit
and the runtime image build pass. Removing `cookie` broke that image build and removing `@nestjs/testing` broke the NestJS
alignment check, which is how both were found to be needed.

## Trust boundaries, 2026-11-10

See [attack-surface.md](attack-surface.md): entry points, uploads, outbound connections, commands
the server runs and the supply chain, with the findings fixed during the review in
`findings.json`.

## Credential incidents, 2026-11-10

The history scan over every ref found no real credential; its matches are synthetic test values
listed in `.gitleaksignore`. No credential is known to be compromised. This review cannot see
credentials outside the repository, such as an operator's `.env` or provider dashboards.
