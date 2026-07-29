## Context

By the end of phase 20, every process role (`api`, `events`, `worker`, `scheduler`, `migrate`,
`doctor`) exists as a working NestJS app and `apps/web` exists as a working Astro app, but nothing
packages them for an operator to install. See `proposal.md` for motivation. The target shape (one
image, multiple roles, Compose Level 1, `copalibre` CLI surface) is fully specified in
`../chaos-vault/20-knowledge-domains/copalibre-platform-architecture.md`; this design covers only how
to build and verify it.

## Goals / Non-Goals

**Goals:**
- One Docker image, role selected at container start — no per-role image proliferation.
- `copalibre doctor` catches misconfiguration before any process starts, not after a crash loop.
- Backup/restore is provably correct via an automated test, not just documented as a manual procedure.

**Non-Goals:**
- No Helm chart or Kubernetes manifests — that is phase 26/27 (`k3s-deployment`,
  `kubernetes-deployment`), which reuse this phase's image/env/health-check contract unchanged.
- No managed-hosting adapter work (Vercel/Appify) — named only as later candidates in chaos-vault,
  not committed here.

## Decisions

**One image, role chosen by entrypoint argument/env var, not one image per role.** Matches the
architecture doc's "one release, multiple process roles" principle directly — building six separate
images would multiply CI build time and let role images drift out of version lockstep with each
other, which the architecture explicitly wants to avoid ("Enterprise deployment is an evolution, not
a rewrite... Compose, K3s, and Kubernetes use the same images").

**`copalibre` as an additional NestJS CLI app (`apps/copalibre`), not a shell script.** Keeps the
administrative CLI in the same TypeScript/Nest ecosystem as the rest of the monorepo (shared config
parsing, shared logging, testable with the same Jest setup) rather than introducing a second
scripting language. Alternative considered: a plain bash script — rejected because `doctor`'s
validation logic (DNS, SSE buffering detection, secret presence) is genuinely complex enough to
benefit from TypeScript's type system and Jest's testability.

**Automated restore test runs on a schedule, not on every pull request.** A full backup→restore
cycle against a real Postgres + object storage is too slow for the per-PR gate. It runs nightly (or
on-demand) as a separate scheduled workflow, while the `deploy-smoke-test` CI job (fast: Compose up +
health check only, no data) stays in the per-PR gate.

**Caddy as the primary documented reverse-proxy example, NGINX as the secondary.** Caddy's automatic
HTTPS and simpler config reduce the chance an operator misconfigures SSE buffering by default; NGINX
remains documented because it's the more common existing-infrastructure choice for self-hosters.
Traefik is deferred to community documentation per the architecture doc ("Coolify, Dokku, Nomad,
Docker Swarm, and comparable orchestrators may receive community or compatibility guidance later").

**`copalibre` is distributed as a repository-root script only — no npm publish, no `npx
@sebasoft/copalibre` path.** Confirmed as a distribution decision this session (previously an
unaddressed gap in chaos-vault, now recorded in `copalibre-platform-architecture.md`'s
"Distribution" subsection). An operator clones the repository or downloads a tagged release
artifact and runs `./copalibre <command>` from that checkout; `apps/copalibre` (see the previous
decision) builds into that in-repo executable, never into a separately versioned or separately
published package. Alternative considered: publishing a thin `npx` bootstrap wrapper — rejected to
avoid a second npm-publish pipeline, a second version number to keep in lockstep with the app
release, and a second place the AGPL source-distribution obligation would need to be tracked.

## Open gates

This phase does not introduce new open gates from chaos-vault, but it depends on the identity
provider and concrete queue adapter remaining explicitly unselected (per the architecture doc's
"Explicit non-decisions and open gates"): `copalibre doctor`'s validation checks must be written
against the documented *contracts* (OIDC-compatible JWKS endpoint reachable; PostgreSQL outbox
reachable) rather than against any specific vendor, so `doctor` keeps working regardless of which
identity provider or optional queue adapter an operator later selects.

## Risks / Trade-offs

- [Risk] A single multi-role image that mis-selects its role at startup could silently run the wrong
  process. → Mitigation: `doctor`-style startup self-check logs the resolved role loudly and refuses
  to start if the role argument is missing or unrecognized.
- [Risk] Restore-test infrastructure (a second clean Postgres + object storage instance) adds CI
  cost. → Mitigation: nightly cadence, not per-PR; reuse the same Compose profile as the smoke test.
- [Risk] Reverse-proxy conformance tests are inherently environment-specific and may pass in CI while
  failing against a real operator's existing proxy. → Mitigation: ship the checklist as a
  self-service `copalibre doctor --check-proxy` an operator can run against their own deployment,
  not only as an internal CI fixture.

## Migration Plan

N/A for a first release — there is no prior deployed CopaLibre installation to migrate. `upgrade-check`
exists as a `copalibre` subcommand from this phase forward so future phases have a place to register
version-compatibility checks, but no upgrade path is exercised until a second release exists.
