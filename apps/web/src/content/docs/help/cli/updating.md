---
title: Updating
description: The non-destructive path to updating the CopaLibre framework and its installed modules.
roles:
  - super-admin
---

## Updating the copalibre CLI itself

`copalibre --version` prints the installed binary's version. Standalone binaries can update themselves directly in place:

```bash
copalibre upgrade --self
```

Alternatively, re-running the install script fetches the latest release idempotently:

```bash
curl -fsSL https://github.com/SebaSOFT/copalibre/releases/latest/download/install.sh | bash
```

This only replaces the `copalibre` binary. It has no effect on a running installation — see below
for updating the framework and its modules.

## Updating the framework

### Automated upgrade with the CLI

The recommended upgrade path uses the `copalibre upgrade` command inside the installation directory. It inspects version disparity, pulls new images, reconciles `docker-compose.yml` and `.env`, runs database migrations, and validates the installation with doctor health checks:

```bash
# 1. Preview changes and check version compatibility
copalibre upgrade --check

# 2. Run the automated upgrade
copalibre upgrade
```

### Manual Compose upgrade procedure

Keep the CLI matching `.copalibre/installation.json` for the current installation. Replacing the binary does not update the marker, Compose files or image pins. Before upgrading, back up PostgreSQL, object storage, configuration and signing keys; retain the old image versions.

```bash
copalibre backup --file backups/pre-upgrade.tar.gz
```

In the existing installation directory, review the target release’s Compose/configuration changes and set both `.env` image references to the target version. Keep the same Compose project and volumes. Pull and check the target image without starting dependencies or applying migrations:

```dotenv
COPALIBRE_IMAGE=ghcr.io/sebasoft/copalibre:1.2.5
COPALIBRE_WEB_IMAGE=ghcr.io/sebasoft/copalibre-web:1.2.5
```

```bash
docker compose pull
docker compose run --rm --no-deps upgrade-check --target-version 1.2.5
```

After a successful check, schedule downtime, stop application writers, take a final backup, then migrate and restart. Do not restart if migration fails:

```bash
docker compose stop gateway web web-ssr api events worker scheduler
copalibre backup --file backups/pre-upgrade.tar.gz
docker compose run --rm migrate && docker compose up --detach --wait
docker compose run --rm doctor
```

Do not delete or rewrite the installation marker to bypass version checks. For later schema operations across versions, use the explicit Compose services as above; the new CLI cannot run `migrate` or `upgrade-check` against the old marker. A new `init` directory is a separate installation, not an in-place upgrade.

After a database migration, selecting older images is not a safe rollback. Keep writers stopped and restore the pre-upgrade PostgreSQL, object and configuration backups into an isolated installation running the previous release. Verify recovery before switching traffic; writes made after the backup are lost.

## Deployment-specific upgrades

For Compose behind NGINX or Caddy, keep the proxy and certificates in place, put traffic into maintenance during migration, and validate/reload only changed proxy configuration. For Kubernetes, use the target chart with reviewed values and both image pins, run a compatibility Job first, and verify migration/doctor Jobs and ingress before reopening traffic. Helm rollback does not undo database migrations. Detailed commands:

- [Caddy](https://github.com/SebaSOFT/copalibre/blob/main/docs/deployment/reverse-proxy/caddy.md#upgrading-copalibre-behind-caddy)
- [NGINX](https://github.com/SebaSOFT/copalibre/blob/main/docs/deployment/reverse-proxy/nginx.md#upgrading-copalibre-behind-nginx)
- [Kubernetes / Helm](https://github.com/SebaSOFT/copalibre/blob/main/docs/deployment/enterprise-kubernetes.md#upgrading-an-existing-helm-release-safely)

## Updating modules

Every installed discipline or tournament profile is a module versioned independently of the
framework.

```bash
copalibre module list --outdated
```

Lists only the installed modules that have a newer published version than the one installed.

```bash
copalibre module add <alias>@<range>
```

Installs a specific version or range (for example `@^2.0.0`) of an already-installed module —
reinstalling with a different version is how a module is updated. A tournament already in progress
keeps referencing the version it was created with; updating a module never retroactively changes a
tournament already underway.

See the [command reference](/help/cli/commands/) for the rest of `module`'s options.
