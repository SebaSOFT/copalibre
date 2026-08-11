# Upgrade safety validation

- Date: 2026-08-07T21:10:38Z
- Interpretation note: this chart has no published version history, so "two minor versions" is produced by bumping Chart.yaml's version by one minor per step (0.1.0 -> 0.2.0 -> 0.3.0) on temporary chart copies, each paired with a new image tag as a real release would be.
- Upgrade 1 (0.1.0 -> 0.2.0): dropped polls = 0, migrate completed at 2026-08-07T21:09:58Z
- Upgrade 2 (0.2.0 -> 0.3.0): dropped polls = 0, migrate completed at 2026-08-07T21:10:33Z
- Result: PASS — both upgrades were zero-downtime and both migrate Jobs completed successfully
