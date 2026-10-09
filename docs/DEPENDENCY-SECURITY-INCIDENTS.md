# Recording transitive dependency security incidents

`scripts/dependency-security-incidents.json` records verified cases where an advisory in a transitive package required a dependency remediation. The CI summary groups one event per distinct direct dependency package root. Duplicate paths and multiple workspaces do not multiply the event count; workspaces remain visible as evidence.

Before adding an event:

1. Confirm the advisory's affected ranges and fixed versions from its authoritative advisory record.
2. Identify direct dependency roots and affected workspace manifests from the lockfile and the remediation change. `yarn why <package> --recursive` helps trace the current tree; use the remediation commit's lockfile (`git show <commit>:yarn.lock`) for historical paths.
3. Record each path from direct root package through intermediate packages to the vulnerable transitive package. Add one `directRoots` entry per distinct root, combining its workspace paths and dependency paths.
4. Add repository-change and advisory URLs under `evidence`, with kinds `remediation` and `advisory`. Use `detectedAt: null` when historical evidence does not establish detection date; never infer it from the remediation date.
5. Extend `coverage.through`, retain `historicalBaseline: "partial"` until the full history has been audited, then run `node --test scripts/dependency-security-incidents.test.mjs` and `node scripts/dependency-security-incidents.mjs`.

Use a new event ID for each independently required remediation, even when advisory and package repeat. Record exceptions with a bounded remediation summary and status `exception`. This report is informational: it does not replace the dependency audit or Dependabot gates, and it never proposes an automatic dependency replacement.
