# copalibre Helm chart

Deploys the CopaLibre release artifact to a K3s/Kubernetes cluster using the
same images, environment contract, health checks, and migration process as
the Docker Compose Level 1 install (`0030-deployment-docker-compose-cli`).
See `0034-k3s-helm-deployment` for the base K3s contract this chart validates
(rolling update, health probes, migration-blocks-rollout, single-logical-
scheduler).

## Base values

`image`, `roles`, `web`, `env`, `secretKeys`, `migrate`, `doctor` mirror
`docker-compose.yml`'s contract — see the comments in `values.yaml` itself.
`scripts/check-helm-compose-parity.mjs` fails CI if `env`/`secretKeys` drift
from `docker-compose.yml`'s `x-application-environment` anchor.

## Enterprise (Level 3) values

The groups below are additive, all defaulted to disabled, and layered on top
of the base chart with no template fork — installing with default values
produces behavior identical to the base chart alone. See
`docs/deployment/enterprise-kubernetes.md` for cluster prerequisites
(External Secrets Operator, cert-manager, an ingress controller, a
custom-metrics adapter) and measured evidence reports.

### `autoscaling`

Per-role (`api`, `events`, `worker`) HorizontalPodAutoscaler. Each role
carries `enabled`, `minReplicas`, `maxReplicas`, `metricName` (the external
metric a custom-metrics adapter must expose), `targetAverageValue`, and an
optional `cpu.enabled`/`cpu.targetAverageUtilization` for CPU-based scaling
alongside the named signal. The three default metric names/signals are the
ones named by the architecture doc — HTTP request rate (`api`), active
connection count (`events`), outbox queue depth/age (`worker`) — none are
native Kubernetes metrics.

### `podDisruptionBudget`

Per-role (`api`, `events`, `worker`, `scheduler`) `enabled`/`minAvailable`.
Independent of `autoscaling` — usable for a fixed-size deployment with no
scaling at all.

### `affinity.antiAffinity`

Single `enabled`/`topologyKey`/`weight` toggle applied to every role's
Deployment: a soft (`preferred`, not `required`) rule that spreads replicas
of the same role across nodes. Soft so a single-node dev cluster is
unaffected.

### `networkPolicy`

`enabled` plus `publicRoles` (default `[api, events]`). When enabled, every
role gets a default-deny NetworkPolicy that always allows ingress from other
CopaLibre pods in the same release; roles listed in `publicRoles` (and
`web`, always) additionally allow ingress from outside the pod network.
Roles not listed — `worker`, `scheduler` by default — accept no external
ingress.

### `ingress`

`enabled`, `className`, `annotations` (cert-manager `ClusterIssuer` by
default), `tls.enabled`/`tls.secretName`, and `hosts.{web,api,events}`. A
host left as `''` is not routed. Layered on top of the `Service` templates,
never replacing them.

### `externalSecrets`

`enabled`, `secretStoreRef.{name,kind}`, `refreshInterval`, and
`remoteRefs` (per-key overrides of the remote store key/property; any key in
`secretKeys` without an override defaults to `{ key: <env var name>,
property: value }`). When enabled, `templates/externalsecret.yaml` manages
the same Secret name the plain `templates/secret.yaml` would otherwise
create, so `templates/deployment.yaml`'s `envFrom` needs no change either
way.
