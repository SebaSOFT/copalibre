# Optional Kamal VM-bridge deployment

[Kamal](https://kamal-deploy.org) deploys the same container images this
chart deploys to Kubernetes, but to plain managed VMs over SSH instead of a
cluster. Per the architecture doc, this is explicitly **not a second product
architecture** — it reuses the identical images and environment contract
validated by `0034-k3s-helm-deployment` and this phase. No Kamal-specific
Dockerfile, image tag, or environment variable exists or is permitted; if a
future change needs one, that's a signal the two paths have started to
diverge and should be treated as a regression against this decision.

## Prerequisite

The `kamal` gem (Ruby), installed on the machine driving deployments (a CI
runner or an operator's workstation) — not on the target VMs themselves.
Kamal connects to target hosts over SSH and drives Docker directly; nothing
Kamal-specific runs inside the deployed containers.

## Images

Identical to every other deployment path in this repo — built from the
repo's single `Dockerfile`:

- `runtime` target: the multi-role image (`api`/`events`/`worker`/
  `scheduler`/`migrate`/`doctor`), role selected at container start via the
  `PRODUCT_ROLE` environment variable, exactly as `deploy/helm/copalibre`'s
  `image.repository`/`image.tag` values reference it.
- `web` target: Caddy serving the built Astro static site, exactly as
  `deploy/helm/copalibre`'s `web.image.repository`/`web.image.tag` values
  reference it.

A Kamal deploy config (`config/deploy.yml`, not included in this repo) maps
each role to a Kamal role/service block pointing at the `runtime` image with
`PRODUCT_ROLE` set accordingly, plus one block for the `web` image — the
same role split `deploy/helm/copalibre/values.yaml`'s `roles` map and
`web` key already express for Kubernetes.

## Environment contract

Every key in `deploy/helm/copalibre/values.yaml`'s `env` block (shared by
`api`/`events`/`worker`/`scheduler`) and `web.env` block applies unchanged —
Kamal's `env` / `env.secret` config supplies the same variable names,
sourced the same way `docker-compose.yml`'s `x-application-environment`
anchor and the Helm chart's `ConfigMap`/`Secret` do.
`scripts/check-helm-compose-parity.mjs` is the source of truth these three
paths (Compose, Helm, Kamal) must never drift from — a Kamal-specific env
var would fail that check's intent even though the script itself only
compares Compose against Helm today.

## Health checks and migrations

- Each role's `probePath` (`/health`, `api` additionally `/ready`) is the
  same HTTP health check Kamal's `healthcheck` config points at — identical
  to `roles.<name>.probePath`/`readinessPath` in `values.yaml`.
- The `migrate` role must run to completion before any `api`/`worker` traffic
  cutover, the same migration-blocks-rollout guarantee
  `0034-k3s-helm-deployment`'s pre-install/pre-upgrade Helm hook (weight
  `-5`) provides. Kamal has no native pre-deploy migration Job primitive —
  run migration via a `kamal app exec` (or an equivalent pre-deploy hook)
  against the `runtime` image with `PRODUCT_ROLE=migrate` *before* triggering
  the roll, and fail the deploy if it exits non-zero, mirroring the Helm
  chart's `backoffLimit: 0` fail-fast behavior in `templates/job-migrate.yaml`.

## Image digest parity

A release deployed via Kamal must use the exact same image digest validated
by `0034-k3s-helm-deployment`'s rolling-update test for that release — build
once, deploy the same artifact everywhere, never rebuild per deployment
target.
