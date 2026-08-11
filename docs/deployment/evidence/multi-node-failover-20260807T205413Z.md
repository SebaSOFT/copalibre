# Multi-node failover validation

- Date: 2026-08-07T21:02:09Z
- Cluster: k3d 3-node (1 server + 2 agents), deploy/helm/k3s-dev-cluster.yaml topology
- Terminated node: k3d-copalibre-failover-agent-1 (hosted pod copalibre-failover-api-6c65b745c4-8hksq)
- Recovery window budget: 360s
- Observed time to 2 healthy api replicas off the terminated node: 345s
- Health-check poll failures during the window (tolerance: <=2, the ordinary kube-proxy endpoint-convergence lag after an ungraceful kill, not a service interruption): 0
- Result: PASS — the remaining api replica continued serving and the terminated pod's role recovered to 2 healthy replicas within the recovery window
