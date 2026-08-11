---
title: Updating
description: The non-destructive path to updating the CopaLibre framework and its installed modules.
---

## Updating the framework

Recommended, non-destructive sequence:

1. **Back up** before touching anything: `./copalibre backup --file backups/pre-upgrade.dump`.
2. **Update** the checkout or image reference to the new version (do not restart services yet).
3. **Check compatibility** against the new version, without restarting anything:
   ```bash
   ./copalibre upgrade-check --target-version <new-version>
   ```
   Reports whether any installed module would stop being compatible with that version (the same
   check `module verify` runs against the running version, but against the target version), and
   lists pending database migrations — without applying any of them. Exits with a non-zero status if
   any module would become incompatible; fix that before continuing.
4. **Restart** with the new version (`./copalibre start` or `docker compose up --detach --wait`).
   Pending migrations apply automatically, in order, before any process role starts serving
   traffic — not a separate manual step.

## Updating modules

Every installed discipline or tournament profile is a module versioned independently of the
framework.

```bash
./copalibre module list --outdated
```

Lists only the installed modules that have a newer published version than the one installed.

```bash
./copalibre module add <alias>@<range>
```

Installs a specific version or range (for example `@^2.0.0`) of an already-installed module —
reinstalling with a different version is how a module is updated. A tournament already in progress
keeps referencing the version it was created with; updating a module never retroactively changes a
tournament already underway.

See the [command reference](/help/cli/commands/) for the rest of `module`'s options.
