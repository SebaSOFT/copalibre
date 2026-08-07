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

<!-- Remaining sections (measured-evidence report links, readiness-claim
     policy) are added by later task groups in
     0035-kubernetes-enterprise-deployment. -->
