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

Run `copalibre upgrade` in the installation directory, with the CLI of the release you are moving
to. First see what it will do; it changes nothing:

```bash
copalibre upgrade --check
```

### Where you start from

| Your installation was created by            | Do this                                                                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1.2.5 or 1.2.6                              | `copalibre upgrade --self`, then `copalibre upgrade --check` and `copalibre upgrade`                        |
| 1.2.1 or earlier (its CLI has no `upgrade`) | Install the new CLI with the install script above, then `copalibre upgrade --check` and `copalibre upgrade` |
| A 1.2.x CLI already ran `copalibre upgrade` | Install the new CLI and run `copalibre upgrade` again                                                       |

Do not let a 1.2.x CLI run `copalibre upgrade` on its own. It writes the new version into `.env`,
`docker-compose.yml` and `.copalibre/installation.json`, reports success, and leaves every container
on the old images; the next restart then starts the new images on the old Compose file, which does
not work. The new CLI recognises an installation left that way, whatever its marker says, and
finishes the job.

### What the upgrade does

1. Pulls the new images while the installation keeps running, so nothing stops if one is missing.
2. Stops the stack, so no write is lost, and backs up the database to
   `backups/pre-upgrade-<from>-to-<to>-<date>.tar.gz`.
3. Replaces `docker-compose.yml` and `deploy/gateway/Caddyfile` with the new release's, when they are
   still as a release shipped them, keeping the previous ones as `docker-compose.yml.<from>.bak` and
   `deploy/gateway/Caddyfile.<from>.bak`. It updates `.env` (new settings, new image tags, the key set
   address that moved under `/api`), keeping `.env.<from>.bak`; values you set are kept.
4. Moves the database from PostgreSQL 17 to 18: it restores the backup into a new volume
   (`postgresql-data`) and compares the number of rows of every table before going on. The 17 volume
   is not touched.
5. Starts the new release and runs `copalibre doctor`. In a terminal, doctor offers to configure what the
   installation is missing, such as email delivery; see [doctor](/help/cli/commands/#doctor).
6. Once doctor passes, checks that the backup can be read back, then removes the PostgreSQL 17 volume
   (`postgres-data`) and the `postgres:17` image. Pass `--keep-old-volume` to keep them; the upgrade
   prints the two commands that remove them later.

The stack is down from step 2 until step 5 succeeds; plan the window by the size of your database.
The move needs free space for a second copy of the database: the upgrade refuses to start without it.
Copy the backup packet off the host once the upgrade finished.

### If you changed docker-compose.yml

A Compose file that matches no release (a service you added, a value you edited) is left as it is.
The upgrade writes the new release's file as `docker-compose.yml.new`, says so, and stops before
changing anything else. Merge your changes into that file, replace `docker-compose.yml` with the
result, and run `copalibre upgrade` again. A gateway configuration you changed is kept, and the
upgrade says so.

### Installations from 1.0

1.0 had no gateway: the edge proxy reached `web`, `api` and `events` directly. From 1.1 on, the
`gateway` service is the only entry, on `COPALIBRE_PORT` (8080 unless set). After the upgrade, point
your proxy at the gateway and set `COPALIBRE_APP_URL` to the address browsers use; run
`copalibre doctor` to confirm.

### Going back

If any step before doctor fails, the upgrade puts the previous files back and starts the previous
release on its untouched PostgreSQL 17 volume, and prints why it stopped. If doctor fails, the new
release keeps running and the upgrade prints these steps without removing anything.

While the PostgreSQL 17 volume still exists (doctor failed, or you passed `--keep-old-volume`):

```bash
docker compose down
cp docker-compose.yml.<from>.bak docker-compose.yml
cp .env.<from>.bak .env
cp deploy/gateway/Caddyfile.<from>.bak deploy/gateway/Caddyfile   # when the upgrade replaced it
docker compose up --detach --wait
```

The PostgreSQL 18 volume (`<project>_postgresql-data`) stays unused; remove it with
`docker volume rm` before trying the upgrade again if you want a clean start.

After the upgrade removed PostgreSQL 17, the backup packet is the way back. Install the previous
release's CLI in a new, empty directory, `copalibre init` there, copy the packet into its `backups/`,
and restore it:

```bash
copalibre restore --file backups/pre-upgrade-<from>-to-<to>-<date>.tar.gz --confirm
```

Writes made after the upgrade are lost. Selecting older images over the migrated database is never a
safe way back.

### Manual Compose upgrade procedure (between 2.x releases)

From a 1.x installation use `copalibre upgrade`: its database has to move to PostgreSQL 18, which these
steps do not do.

Keep the CLI matching `.copalibre/installation.json` for the current installation. Replacing the binary does not update the marker, Compose files or image pins. Before upgrading, back up PostgreSQL, object storage, configuration and signing keys; retain the old image versions.

```bash
copalibre backup --file backups/pre-upgrade.tar.gz
```

In the existing installation directory, review the target release’s Compose/configuration changes and set both `.env` image references to the target version. Keep the same Compose project and volumes. Pull and check the target image without starting dependencies or applying migrations:

```dotenv
COPALIBRE_IMAGE=ghcr.io/sebasoft/copalibre:1.2.6
COPALIBRE_WEB_IMAGE=ghcr.io/sebasoft/copalibre-web:1.2.6
```

```bash
docker compose pull
docker compose run --rm --no-deps upgrade-check --target-version 1.2.6
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
