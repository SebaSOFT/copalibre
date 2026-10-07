# NestJS 12 compatibility gate (0333)

Checked on 2026-10-07 against package metadata published to npm and the repository's
current manifests, lockfile, and Node runtime. This is the evidence required by task 1.1;
all selected peers support the proposed migration without overrides or forks.

## Compatibility matrix

| Area                       | Current repository value                           | Candidate                              | Published requirement / evidence                                                                                            | Result                                |
| -------------------------- | -------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Node.js                    | 26.10.0; root engine `>=24.0.0 <=26`               | 26.x                                   | Nest common/core/platform-fastify support Node `>=20`; Swagger supports `^20.19.0                                           |                                       | >=22.12.0`; Throttler 6.7.1 supports `^20.19.0 |                                       | ^22.12.0                |     | >=24.0.0`  | Pass |
| `@nestjs/common`           | 11.1.28                                            | 12.1.2                                 | RxJS `^7.1.0`, `reflect-metadata ^0.1.12                                                                                    |                                       | ^0.2.0`                                        | Pass                                  |
| `@nestjs/core`             | 11.1.28                                            | 12.1.2                                 | `@nestjs/common ^12.0.0`, RxJS `^7.1.0`, `reflect-metadata ^0.1.12                                                          |                                       | ^0.2.0`                                        | Pass when framework family is aligned |
| `@nestjs/platform-fastify` | Manifest `^11.1.29`; root resolution pinned 11.2.6 | 12.1.2                                 | Requires Nest core/common `^12.0.0`; ships Fastify 5.12.5 and Fastify plugins in its package dependencies                   | Pass after removing stale root pin    |
| `@nestjs/testing`          | 11.1.28                                            | 12.1.2                                 | Requires Nest core/common `^12.0.0`                                                                                         | Pass when framework family is aligned |
| `@nestjs/swagger` (API)    | 11.4.6                                             | 12.0.2                                 | Requires Nest core/common `^12.0.0`, TypeScript `^5.5.0                                                                     |                                       | ^6.0.0`, `reflect-metadata ^0.1.12             |                                       | ^0.2.0`; Node `^20.19.0 |     | >=22.12.0` | Pass |
| `@nestjs/throttler` (API)  | 6.5.0                                              | 6.7.1                                  | Supports Nest core/common majors 7 through 12 and `reflect-metadata ^0.1.13                                                 |                                       | ^0.2.0`; Node `^20.19.0                        |                                       | ^22.12.0                |     | >=24.0.0`  | Pass |
| Fastify                    | Lock resolves 5.12.5 via platform-fastify          | 5.12.5                                 | Exact dependency of `@nestjs/platform-fastify@12.1.2`                                                                       | Pass                                  |
| TypeScript                 | 5.9.3                                              | 5.9.3                                  | Swagger supports `^5.5.0                                                                                                    |                                       | ^6.0.0`                                        | Pass                                  |
| RxJS                       | 7.8.2                                              | 7.8.2                                  | Nest common/core support `^7.1.0`                                                                                           | Pass                                  |
| `reflect-metadata`         | 0.2.2                                              | 0.2.2                                  | Nest, Swagger, and Throttler support `^0.2.0`                                                                               | Pass                                  |
| `@fastify/static`          | Not installed or imported by these services        | No change; 10.1.5 only if later needed | Optional peer. Platform-fastify accepts `^10.1.2`; Swagger accepts `^8`, `^9`, or `^10`. No service uses this plugin today. | Not required                          |
| `@fastify/helmet` (API)    | 13.1.1                                             | 13.1.1                                 | Existing Fastify integration; no Nest peer constraint                                                                       | Pass; no update needed                |

### Package metadata references

- [`@nestjs/common@12.1.2`](https://www.npmjs.com/package/@nestjs/common/v/12.1.2)
- [`@nestjs/core@12.1.2`](https://www.npmjs.com/package/@nestjs/core/v/12.1.2)
- [`@nestjs/platform-fastify@12.1.2`](https://www.npmjs.com/package/@nestjs/platform-fastify/v/12.1.2)
- [`@nestjs/testing@12.1.2`](https://www.npmjs.com/package/@nestjs/testing/v/12.1.2)
- [`@nestjs/swagger@12.0.2`](https://www.npmjs.com/package/@nestjs/swagger/v/12.0.2)
- [`@nestjs/throttler@6.7.1`](https://www.npmjs.com/package/@nestjs/throttler/v/6.7.1)
- [`@fastify/static@10.1.5`](https://www.npmjs.com/package/@fastify/static/v/10.1.5)

## Dependabot PR 370 failure triage

PR 370 was closed without merge and changed only `@nestjs/core` to 12.1.2. The root
`resolutions` entry also forced `@nestjs/platform-fastify` to 11.2.6, overriding the
workspace range. Its seven
failed checks were guard coverage, aggregate and two grouped integration checks, OpenAPI
contract lint, aggregate unit tests, and unit group 2. The failed logs show Nest 12
internal imports failing against the still-Nest-11 package family (`@nestjs/common/internal`
export/path errors), plus Jest ESM loading failures involving Nest core, Swagger, and
platform-fastify. The package families must therefore move together, and the stale root
resolution must be removed. The full gate suite below is still required; this triage does
not assume that alignment alone fixes any independent Jest or runtime issue.

## Decision

Proceed with Nest 12.1.2 for common/core/platform-fastify/testing in all four service
workspaces, Swagger 12.0.2 and Throttler 6.7.1 in API, remove the stale root
`@nestjs/platform-fastify` resolution, and refresh the lockfile. Do not add
`@fastify/static`: its peer is optional and the repository does not use it. Stop if the
immutable install, peer checks, or runtime gates reveal a requirement outside these
published compatible ranges.

## Jest and ESM test-runner failure

The aligned runtime installs, typechecks, and imports Nest common and Throttler under
native Node ESM. API unit tests still fail before executing six suites because Jest's
VM loader encounters a `require(esm)` cycle involving `@nestjs/throttler` and
`@nestjs/common`. Jest describes ESM support as experimental. Throttler issue
[#2713](https://github.com/nestjs/throttler/issues/2713) reports the same Nest 12/Jest
cycle; proposed ESM publishing work in [PR #2714](https://github.com/nestjs/throttler/pull/2714)
is still open, so no published fix is available to this change. Vitest documents
externalizing a CJS dependency so Node loads its entry and internal `require()` calls
through the native module loader ([common errors guidance](https://vitest.dev/guide/common-errors.html)).

Decision: prove that approach with Vitest 5 against the actual API Throttler guard and
a representative Nest test before migrating API tests. Only migrate API to Vitest if
the proof passes; keep the other three workspaces on Jest. If it does not pass without
unsupported workarounds, stop and request owner direction.

## Rate-limiter alternative review

The API's `PrincipalThrottlerGuard` uses Nest's `@Throttle` metadata, derives tracking
keys from authenticated `request.subject` (falling back to IP for anonymous requests),
and routes explicitly shared policies through `SharedThrottlerStorage`, which persists
counters in the application database. Controllers opt into shared buckets with
`@SharedThrottle()`.

[`@fastify/rate-limit`](https://github.com/fastify/fastify-rate-limit) supports Fastify
5 and provides per-route configuration, asynchronous key generation, and custom
storage. Replacing Throttler would still require adapting Nest route metadata and
decorators, preserving subject-aware keying and its anonymous fallback, and integrating
the existing durable shared storage with Fastify's hook lifecycle. It is therefore a
viable future integration, not a drop-in fix for this test-loader issue. Decision for
0333: retain `@nestjs/throttler` and its current guard/storage behavior; evaluate a
replacement in a separate change if there is a product or operational reason to move
rate limiting out of the Nest integration.

## Vitest proof and API runner results

On Node.js 26.10.0 with Vitest 5.0.3, externalizing `@nestjs/throttler` through
Vitest's native Node loader passed the focused principal-guard proof (2 files, 17
checks). The complete API unit suite then passed (25 files, 227 tests). Coverage passed
the existing thresholds: 95.77% statements, 90.49% branches, 93.65% functions, and
97.01% lines. The API PostgreSQL integration suite passed (53 files, 478 tests), and
the SQLite shared-storage integration check passed (1 file, 3 tests).

The remaining verification passed on the refreshed checkout: root Jest integration
projects (50 suites, 343 tests), OpenAPI generation and contract lint (153 paths, no
generated contract diff), and Playwright (336/336 tests) when forced to build and serve
this checkout on an unused port. The first local E2E attempt reused an unrelated stale
server on port 4321; it is not representative of this branch's build.
