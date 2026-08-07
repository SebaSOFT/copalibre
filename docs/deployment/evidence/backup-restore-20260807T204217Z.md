# Backup/restore validation

- Date: 2026-08-07T20:44:58Z
- PostgreSQL integrity check (packages/persistence's backup-drill snapshot, same as 0030's Compose-level check): PASS
- Object-storage integrity check (SHA-256 of a known test object before/after): PASS
- Result: PASS — the latest PostgreSQL and object-storage backup restored into a clean Kubernetes installation and passed integrity checks
