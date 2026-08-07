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

<!-- Remaining sections (managed PostgreSQL/Redis/object storage wiring,
     measured-evidence report links, readiness-claim policy) are added by
     later task groups in 0035-kubernetes-enterprise-deployment. -->
