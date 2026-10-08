# Enterprise Kubernetes deployment

Layers autoscaling, disruption protection, network policy, ingress, external
secrets, and managed external dependencies onto the K3s-validated Helm chart
(the K3s Helm deployment). Every capability below is an additive,
defaulted-off `values.yaml` group — see `deploy/helm/copalibre/README.md`
for the full schema of each.

## Using the copalibre CLI with a Kubernetes installation

`copalibre init --kubernetes [--namespace <ns>] [--release <name>] [--context <ctx>]` scaffolds a
`values.yaml` (a copy of this chart's own documented defaults, the same starting point `helm show
values` gives) and records an installation marker in the current directory — no compose file, no
`.env`; this chart's own Secret/ConfigMap mechanism stays authoritative for configuration. Later
`copalibre` commands run from that directory pick up the recorded release and namespace
automatically; `--namespace`/`--release` default to `default`/`copalibre` when omitted.

Bootstrapping the first administrator runs as a one-shot Job instead of `kubectl exec` into a
running pod. Run the example from the checkout root after configuring `values.yaml` with the
required database, identity, email and public URL settings. These image tags are available only
after the 1.2.6 release is published; for an earlier installation, use its released version:

```bash
helm install my-copalibre deploy/helm/copalibre -f values.yaml \
  --set image.repository=ghcr.io/sebasoft/copalibre --set-string image.tag=1.2.6 \
  --set web.image.repository=ghcr.io/sebasoft/copalibre-web --set-string web.image.tag=1.2.6 \
  --set createAdmin.enabled=true \
  --set createAdmin.organizationAlias=my-league \
  --set createAdmin.organizationName="My League" \
  --set createAdmin.email=admin@example.com
```

`doctor` and `migrate` continue to run as existing Jobs (`job-doctor.yaml`, `job-migrate.yaml`), not
through the CLI directly: `copalibre doctor`, `copalibre migrate`, `copalibre backup`, and `copalibre
restore` all refuse when run from a Kubernetes-mode directory, naming the Job to use instead where
one exists. `statistics-rebuild` and `module add/list/remove/verify` work exactly as they do against
a Compose-mode installation: run `copalibre login --api-url <the cluster's public API URL>` once,
then every later invocation from that directory authenticates over HTTP — no `kubectl` access
involved.

## Upgrading an existing Helm release safely

These steps upgrade an existing release; they do not install a second copy. Examples use release
`my-copalibre` in namespace `default`. Substitute your actual names consistently. Use the reviewed
chart from the target release checkout and published runtime/web images. Preserve database and
object-store endpoints, secret references, public hostnames and signing keys.

The quiesced procedure below can exceed two minutes: it stops all application deployments and
waits for migrations and rollout. For a hard two-minute maximum, rehearse with production-sized data
and require measured margin below the limit. Keep ingress on the old release during preflight; use a
rolling cutover only after verifying the migration works with both old and new application versions.
If that compatibility or timing is not proven for the target release, this procedure does not meet
the downtime limit. Do not scale everything to zero and expect the limit to hold.

### 1. Capture configuration and recovery evidence

Store values in a private directory: Helm values can contain credentials. Record the current Helm
revision, both image tags/digests, replica counts, HPA settings and ingress/TLS configuration.

```bash
umask 077
mkdir -p release-backup
helm history my-copalibre -n default
helm get values my-copalibre -n default -o yaml > release-backup/values.yaml
kubectl get deployment,hpa,ingress -n default \
  -l app.kubernetes.io/instance=my-copalibre -o yaml > release-backup/workloads.yaml
```

Take a verified PostgreSQL backup/snapshot and a matching object-store backup. Preserve signing keys
and secret-manager versions separately. The CLI's Compose `backup`/`restore` commands do not operate
on Kubernetes installations. Use your database and storage provider's recovery procedure and verify
it in an isolated namespace/database before the maintenance window.

Copy the previous user-supplied values to a private `upgrade-values.yaml` and reconcile them with the
target chart's defaults (`helm show values deploy/helm/copalibre`). Do not blindly replace them with
new defaults or rely on `--reuse-values` to discover new configuration. Keep
`createAdmin.enabled=false` for an existing installation. If `externalSecrets.enabled=true`, verify
the existing release Secret has the intended values before proceeding: the migration hook needs it
before ordinary resources are applied.

### 2. Check the target runtime against the existing database

Run a short-lived Job using the **target** runtime image and the existing release's ConfigMap/Secret.
This checks installed module compatibility and reports pending migrations without applying them.
Save this as `upgrade-check.yaml`, adapting release and namespace names:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: my-copalibre-upgrade-check-1-2-1
  namespace: default
spec:
  backoffLimit: 0
  template:
    metadata:
      labels:
        app.kubernetes.io/name: copalibre
        app.kubernetes.io/instance: my-copalibre
        app.kubernetes.io/component: migrate
    spec:
      restartPolicy: Never
      containers:
        - name: upgrade-check
          image: ghcr.io/sebasoft/copalibre:1.2.6
          command: [node, apps/copalibre/dist/main.js]
          args: [upgrade-check, --target-version, 1.2.6]
          envFrom:
            - configMapRef:
                name: my-copalibre-env
            - secretRef:
                name: my-copalibre-secret
```

```bash
kubectl apply -f upgrade-check.yaml
kubectl wait -n default --for=condition=complete \
  job/my-copalibre-upgrade-check-1-2-5 --timeout=5m
kubectl logs -n default job/my-copalibre-upgrade-check-1-2-5
```

Stop on failure. Keep failed Job logs; use a new Job name for a retry after correcting configuration.
The Job requires the same database network access as the migration hook. If the target release needs
new environment settings for its check, supply those explicitly; this example reads current settings.

### 3. Quiesce writers and apply the reviewed chart

Unless the target migrations have been verified compatible with both running versions, use a
maintenance window. Keep ingress on your maintenance backend, pause GitOps/other controllers that
would undo manual scaling, and suspend autoscaling according to your controller's procedure. Record
the desired settings first. Stop CopaLibre deployments and wait for application pods to terminate:

```bash
kubectl scale deployment -n default \
  -l app.kubernetes.io/instance=my-copalibre --replicas=0
kubectl get pods -n default -l app.kubernetes.io/instance=my-copalibre
```

Take the final database/object backup with writers stopped. Then upgrade using the desired production
replicas and configuration in `upgrade-values.yaml`:

```bash
helm upgrade my-copalibre deploy/helm/copalibre -n default \
  -f upgrade-values.yaml \
  --set image.repository=ghcr.io/sebasoft/copalibre --set-string image.tag=1.2.6 \
  --set web.image.repository=ghcr.io/sebasoft/copalibre-web --set-string web.image.tag=1.2.6 \
  --set createAdmin.enabled=false --set doctor.enabled=true \
  --wait --wait-for-jobs --timeout 10m
```

The chart writes its ConfigMap/Secret hooks at weight `-5`, then runs the target migration Job at
weight `0`, before updating application workloads. This orders migration before new pods; it does
**not** stop old writers for you or prove arbitrary migrations are safe without downtime.
No automatic rollback flag is used: rolling workload manifests back cannot undo a database migration.

### 4. Verify before reopening traffic

```bash
helm status my-copalibre -n default
kubectl get jobs,pods -n default -l app.kubernetes.io/instance=my-copalibre
kubectl rollout status deployment/my-copalibre-api -n default --timeout=5m
kubectl rollout status deployment/my-copalibre-web -n default --timeout=5m
kubectl rollout status deployment/my-copalibre-web-ssr -n default --timeout=5m
```

Inspect the revision-suffixed `my-copalibre-migrate-<revision>` and `my-copalibre-doctor-<revision>`
Job logs and confirm worker/events/scheduler rollout too. Check API readiness, native/OIDC login,
public tournament pages, uploads and live SSE through ingress. Keep TLS secrets, DNS names and
unbuffered SSE settings intact. **The Helm ingress sends its web hostname directly to the web
Service, unlike the Compose gateway.** Verify app-origin `/auth/*`, `/api/*` and `/events/*` routing
in your ingress configuration; the default separate-host rules do not supply those paths on the web
hostname. Treat a failed login or SSE check as a failed upgrade, even if all pods are Ready.

Restore intended HPA/GitOps settings and reopen traffic only after those checks pass.

### Failure and rollback

If the check fails before migration, leave the old release serving and correct the inputs. If a
migration or rollout fails during maintenance, keep traffic blocked and capture hook/Pod logs.
`helm rollback` changes Kubernetes resources; it does **not** restore PostgreSQL or object data.
After schema changes, recover the pre-upgrade database and matching objects/configuration into an
isolated target with the previous chart/images, validate it, then switch traffic. Do not run old
application code against a new schema unless compatibility has been explicitly verified. Writes made
after the backup are not present in the restored target. See also
[Compose recovery](../self-hosting.md#recovery-if-an-upgrade-fails) for the same data boundary.

### Personal Access Token security cutover

Before releasing repaired PAT authentication, run one short-lived Job using same image, ConfigMap,
and Secret as release. Replace `my-copalibre` with Helm release name and image reference with target
release image. Run dry run, verify aggregate count, then apply confirmation Job.

```bash
kubectl -n default create job my-copalibre-pat-cutover-dry-run \
  --image=ghcr.io/sebasoft/copalibre:<version> \
  --dry-run=client -o yaml -- /usr/local/bin/node apps/copalibre/dist/main.js \
  revoke-legacy-personal-access-tokens --dry-run | \
  kubectl -n default set env --local -f - -o yaml \
    --from=configmap/my-copalibre-env --from=secret/my-copalibre-secret | \
  kubectl apply -f -
kubectl -n default wait --for=condition=complete job/my-copalibre-pat-cutover-dry-run --timeout=5m

kubectl -n default create job my-copalibre-pat-cutover-confirm \
  --image=ghcr.io/sebasoft/copalibre:<version> \
  --dry-run=client -o yaml -- /usr/local/bin/node apps/copalibre/dist/main.js \
  revoke-legacy-personal-access-tokens --confirm | \
  kubectl -n default set env --local -f - -o yaml \
    --from=configmap/my-copalibre-env --from=secret/my-copalibre-secret | \
  kubectl apply -f -
kubectl -n default wait --for=condition=complete job/my-copalibre-pat-cutover-confirm --timeout=5m
```

Inspect both Job logs for aggregate counts only; retain them as deployment evidence. Do not deploy
repaired PAT authentication until confirmation Job succeeds. Existing integrations then need
replacement credentials.

### Kubernetes-hosted module development (kind/minikube only)

The chart has no `module-dev` values group — `init --kubernetes` never sets one up. A `hostPath`
volume only reaches a laptop's filesystem when the pod is guaranteed to run on that one machine,
true for a local single-node `kind`/`minikube` cluster but never a real multi-node one, so this
isn't a chart feature. Against a local cluster anyway, the same
bind-mount idea works as a manual patch:

1. Mount your module workspace into the cluster node:
   - **kind**: add an `extraMounts` entry to your `kind` cluster config before creating it:
     ```yaml
     nodes:
       - role: control-plane
         extraMounts:
           - hostPath: /abs/path/to/modules-dev
             containerPath: /var/lib/copalibre/modules-dev
     ```
   - **minikube**: `minikube start --mount --mount-string="/abs/path/to/modules-dev:/var/lib/copalibre/modules-dev"`
2. After `helm install`, patch the `api` and `worker` Deployments to add the matching `hostPath`
   volume/volumeMount and set `COPALIBRE_MODULE_SOURCE_ALLOWLIST` (repeat for both — the example
   below shows `api`):
   ```bash
   kubectl patch deployment <release>-api --type=json -p '[
     {"op": "add", "path": "/spec/template/spec/volumes/-",
      "value": {"name": "modules-dev", "hostPath": {"path": "/var/lib/copalibre/modules-dev"}}},
     {"op": "add", "path": "/spec/template/spec/containers/0/volumeMounts/-",
      "value": {"name": "modules-dev", "mountPath": "/var/lib/copalibre/modules-dev"}},
     {"op": "add", "path": "/spec/template/spec/containers/0/env/-",
      "value": {"name": "COPALIBRE_MODULE_SOURCE_ALLOWLIST", "value": "file:///var/lib/copalibre/modules-dev"}}
   ]'
   ```
3. Scaffold and install exactly as the Compose workflow (`docs/MODULES.md`) does:
   `copalibre module scaffold ... --output modules-dev/<alias>`, then `copalibre module add <alias>
--source file:///var/lib/copalibre/modules-dev/<alias>`.

A manual, unsupported-by-the-chart recipe for local development only — never apply it against a
real multi-node cluster.

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
  CPU-based fallback for this signal by default (the chart deliberately exposes "exactly
  these three signals"); `autoscaling.worker.cpu.enabled` exists
  only as an explicit opt-in, not a silent substitute.
- **cert-manager**, required by `ingress.enabled` when
  `ingress.tls.enabled` is true (the default annotation targets a
  cert-manager `ClusterIssuer`).
- **An ingress controller** (e.g. ingress-nginx), required by
  `ingress.enabled`. The chart's default annotations also disable nginx
  response buffering (`nginx.ingress.kubernetes.io/proxy-buffering: "off"`),
  so the `events` host's SSE streams aren't delayed; override
  `ingress.annotations` for a different controller.
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
(AWS SDK `S3Client`, so any S3-compatible endpoint works: AWS S3, Cloudflare
R2, Backblaze B2, a self-hosted Garage instance, etc.). Also set
`_REGION` when the endpoint enforces its own region (a self-hosted Garage
instance rejects every request with `AuthorizationHeaderMalformed` unless
`_REGION` matches its configured `s3_region`; AWS S3 defaults to
`us-east-1` when left blank). `_ACCESS_KEY` and `_SECRET_KEY` are both
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
  passes the same integrity checks as the Docker Compose deployment's
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
