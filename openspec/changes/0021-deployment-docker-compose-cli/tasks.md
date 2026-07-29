## 1. Multi-role Docker image

- [ ] 1.1 Write root `Dockerfile` (multi-stage: build monorepo once, slim runtime layer)
- [ ] 1.2 Add an entrypoint script that selects the process role from `PRODUCT_ROLE` env var or CLI arg
- [ ] 1.3 Entrypoint logs the resolved role loudly at startup and exits non-zero if unrecognized/missing
- [ ] 1.4 Confirm image runs each of `api`, `events`, `worker`, `scheduler`, `migrate`, `doctor` correctly from the same tag

## 2. Docker Compose profiles

- [ ] 2.1 Write `docker-compose.yml` (prod profile): all process roles + PostgreSQL + optional Redis/object-storage/SMTP via env
- [ ] 2.2 Replace phase-1's Postgres-only `docker-compose.dev.yml` with a full dev profile including Compose Watch
- [ ] 2.3 Define named volumes and document their backup scope
- [ ] 2.4 Document the reverse-proxy boundary explicitly (Compose does not terminate TLS itself)

## 3. copalibre CLI

- [ ] 3.1 Scaffold `apps/copalibre` (NestJS CLI app)
- [ ] 3.2 Implement `copalibre init` (generate non-secret local defaults, list required secrets)
- [ ] 3.3 Implement `copalibre doctor` (secrets, ports, DNS/public URLs, PostgreSQL, object storage, SMTP, reverse-proxy headers, SSE buffering/timeouts, writable persistent paths)
- [ ] 3.4 Implement `copalibre dev` and `copalibre dev --hybrid`
- [ ] 3.5 Implement `copalibre start`
- [ ] 3.6 Implement `copalibre migrate` (delegates to `apps/migrate`)
- [ ] 3.7 Implement `copalibre create-admin`
- [ ] 3.8 Implement `copalibre backup`
- [ ] 3.9 Implement `copalibre restore`
- [ ] 3.10 Implement `copalibre upgrade-check` (stub compatibility-check registry for future releases)

## 4. Reverse-proxy conformance

- [ ] 4.1 Write a tested Caddy example configuration (forwarded headers, no SSE buffering, long idle timeout, heartbeat support)
- [ ] 4.2 Write a tested NGINX example configuration (same requirements)
- [ ] 4.3 Implement `copalibre doctor --check-proxy` self-service conformance check an operator can run against their own reverse proxy

## 5. Unit tests

- [ ] 5.1 Unit test the entrypoint role-resolution logic (valid role, missing role, unrecognized role)
- [ ] 5.2 Unit test `copalibre doctor`'s individual validators in isolation (mocked secrets/DNS/DB/SMTP checks)
- [ ] 5.3 Unit test `copalibre backup`/`restore` argument parsing and dry-run mode

## 6. Integration tests

- [ ] 6.1 Integration test: `copalibre doctor` against a deliberately misconfigured environment reports the specific failure and exits non-zero
- [ ] 6.2 Integration test: `copalibre create-admin` against a fresh database creates exactly one admin account
- [ ] 6.3 Integration test (nightly, not per-PR): full backup → restore-into-clean-install → integrity-check cycle recovers tournament/participant/result/audit data losslessly
- [ ] 6.4 Integration test: reverse-proxy conformance suite against both the Caddy and NGINX example configs, and a deliberately-misconfigured buffering proxy to confirm the suite catches it

## 7. E2E tests

- [ ] 7.1 E2E (Playwright, against a Compose-started instance): a fresh install reaches a working control-web login page with zero manual steps beyond the documented Compose-up command
- [ ] 7.2 E2E: complete `copalibre init` → `doctor` → `start` → `create-admin` flow end-to-end on a clean host equivalent (CI runner)

## 8. CI wiring

- [ ] 8.1 Add `build` job to `.github/workflows/ci.yml` (needs `unit`, `integration`, `e2e` jobs from prior phases green): builds the multi-role Docker image, pushes to a CI-local registry/artifact cache
- [ ] 8.2 Add `deploy-smoke-test` job (needs `build`): `docker compose up`, poll every process role's `/health` endpoint until healthy or timeout, fail the job on timeout
- [ ] 8.3 Add a separate scheduled (nightly) workflow `backup-restore-drill.yml` running task 6.3's full restore cycle, distinct from the per-PR `ci.yml`
- [ ] 8.4 Confirm the full per-PR pipeline shape is now `install → lint → typecheck → unit → integration → e2e → build → deploy-smoke-test` in `.github/workflows/ci.yml`, completing the shape started in phase 1
