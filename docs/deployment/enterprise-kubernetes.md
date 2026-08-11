# Enterprise Kubernetes deployment

Layers autoscaling, disruption protection, network policy, ingress, external
secrets, and managed external dependencies onto the K3s-validated Helm chart
(`0034-k3s-helm-deployment`). Every capability below is an additive,
defaulted-off `values.yaml` group — see `deploy/helm/copalibre/README.md`
for the full schema of each.

## Cluster prerequisites

These are prerequisites of the operator's cluster, not chart dependencies —
nothing in this chart installs them.

- **A custom-metrics adapter** (e.g. Prometheus Adapter, KEDA), required by
  `autoscaling.<role>.enabled`. None of the three signals this chart's HPA
  templates use — HTTP request rate (`api`), active SSE connection count
  (`events`), outbox queue depth/age (`worker`) — are native Kubernetes
  metrics; the adapter must expose each `autoscaling.<role>.metricName` as a
  Kubernetes External metric. The `worker` signal in particular (outbox
  queue depth/age) has no off-the-shelf adapter — it requires a
  custom-metrics adapter configured to read the outbox table/queue directly
  and publish it under `autoscaling.worker.metricName`. There is no
  CPU-based fallback for this signal by default (see `design.md`'s "exactly
  these three signals" decision); `autoscaling.worker.cpu.enabled` exists
  only as an explicit opt-in, not a silent substitute.
- **cert-manager**, required by `ingress.enabled` when
  `ingress.tls.enabled` is true (the default annotation targets a
  cert-manager `ClusterIssuer`).
- **An ingress controller** (e.g. ingress-nginx), required by
  `ingress.enabled`.
- **External Secrets Operator**, required by `externalSecrets.enabled`.

## Managed external dependencies

`packages/persistence` already targets PostgreSQL and S3-compatible object
storage generically — connecting a managed provider is configuration, not a
code change. Set the relevant `env` keys in `values.yaml` (or via
`externalSecrets`, see above) to the managed endpoint's connection details;
no adapter code, image, or chart template changes with provider.

### Managed PostgreSQL

Set `env.DATABASE_URL` to the managed instance's connection string (any
`postgres://` URL `packages/persistence/src/database.ts` accepts — it reads
`DATABASE_URL` directly and never falls back to a default host). Works
identically for RDS, Cloud SQL, Azure Database for PostgreSQL, or a
self-hosted PostgreSQL — the chart has no provider-specific logic.

### Managed Redis

The architecture doc lists managed Redis as cache/lock infrastructure,
**never the source of truth for scheduler coordination or any other
authoritative state** — `packages/persistence`'s scheduler lease
(`packages/persistence/src/schema.ts`, the `scheduler_lease` table) is
PostgreSQL-backed, not Redis. `docker-compose.yml` already provisions an optional `redis` service (profile
`optional-adapters`, not started by default) for parity, but as of this
phase no CopaLibre code path actually consumes a Redis connection string;
there is no `env.REDIS_URL` key in `values.yaml` to set. This section
documents the wiring point the architecture doc anticipates so a future
cache/lock consumer has a documented slot (a connection-string env var
added the same way `DATABASE_URL` is), not a currently-active integration —
don't infer Redis is deployed or required by installing this chart.

### Managed S3-compatible object storage

Set `env.COPALIBRE_OBJECT_STORAGE_URL`, `_ACCESS_KEY`, `_SECRET_KEY`, and
`_BUCKET` to the managed provider's endpoint and credentials — consumed by
`packages/persistence/src/object-storage.ts`'s `ObjectStorageAdapter`
(AWS SDK `S3Client`, so any S3-compatible endpoint works: AWS S3, MinIO,
Cloudflare R2, Backblaze B2, etc.). `_ACCESS_KEY` and `_SECRET_KEY` are both
in `secretKeys`, so they're covered by `externalSecrets` the same as
`DATABASE_URL`.

### Optional Kamal VM-bridge path

See `docs/deployment/kamal.md` for the documented alternative to full
Kubernetes: the same images and environment contract, deployed to managed
VMs instead of a cluster.

## Measured evidence

The architecture doc's explicit open gate — "Enterprise claims require
measured multi-node, failover, backup/restore, and upgrade evidence" — is
produced by three scripts, each run locally against a real k3d cluster
during development and on a schedule in CI (`k8s-enterprise-validate`, see
`.github/workflows/`):

- `scripts/validate-multi-node-failover.sh` — `api`/`events`/`worker` run at
  `replicas >= 2` across at least two nodes; one node is forcibly terminated;
  the remaining replica keeps serving and the lost pod reschedules onto a
  healthy node within the documented recovery window.
- `scripts/validate-backup-restore.sh` — the latest PostgreSQL and
  object-storage backup restores into a clean Kubernetes installation and
  passes the same integrity checks as `0030-deployment-docker-compose-cli`'s
  Compose-level backup/restore requirement.
- `scripts/validate-upgrade-safety.sh` — a chart upgrade across two minor
  versions completes with zero downtime and a successful migration Job at
  each step.

Each script writes a dated Markdown evidence report to
`docs/deployment/evidence/` on every run — see that directory for the most
recent reports. Latest passing reports as of this phase's implementation:

- [multi-node-failover-20260807T205413Z](evidence/multi-node-failover-20260807T205413Z.md) — PASS
- [backup-restore-20260807T204217Z](evidence/backup-restore-20260807T204217Z.md) — PASS
- [upgrade-safety-20260807T210717Z](evidence/upgrade-safety-20260807T210717Z.md) — PASS

## Enterprise-readiness claim policy

**This phase does not, by itself, claim CopaLibre is "enterprise-ready."**
That claim requires the evidence above to exist and pass — a documentation
decision outside this phase's scope, not something this phase asserts on its
own.

Any future readiness language added to this document (or elsewhere) is
enforced structurally, not just by convention:
`scripts/check-enterprise-readiness-docs.mjs` runs in CI
(`.github/workflows/ci.yml`) and fails the build if this file contains
readiness language (e.g. "enterprise-ready", "enterprise Kubernetes support")
without linking a dated, passing evidence report from **both** the
multi-node-failover and backup-restore validations above. See that script
for the exact gate logic.
