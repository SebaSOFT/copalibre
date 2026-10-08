# Demo data for development

A fresh development stack has no tournaments. `copalibre dev demo` loads a committed, realistic one so
every screen, the public site and the broadcast views have something real to render.

Introduced with the Panamericano demo dataset. The data lives in `packages/demo-datasets`.

## What is in it

`panamericano-clubes-2025` is a copy of the 2025/26 Campeonato Panamericano Clubes Senior Varones, a
rink hockey championship: 24 clubs, six round-robin groups (`Grupo A` to `Grupo F`), three cups (`Copa
Oro`, `Copa Plata`, `Copa Bronce`), 72 played games with date, time, venue, referees and goal events,
a published schedule, the squads, and the club and tournament emblems.

It is loaded into its own organization, `panamericano-demo`, whose tournament is published, so the
public pages work at `/panamericano-demo/tournaments/panamericano-clubes-2025`.

## Loading it

1. Start the development stack: `copalibre dev` (or `docker compose -f docker-compose.dev.yml
--profile infrastructure up --detach --wait` for just the infrastructure).
2. Install the `rink-hockey` discipline once. The dataset needs it and loading never installs modules:
   `copalibre module add rink-hockey` (or, from a sibling checkout of the modules repository,
   `copalibre module add rink-hockey --source file:///abs/path/to/copalibre-modules`).
3. `copalibre dev demo panamericano-clubes-2025`. `copalibre dev demo --list` shows what is available.

Loading is one transaction, so a failure leaves nothing behind, and it is safe to repeat: a dataset that
is already loaded is reported as `skipped`. There is no wipe option; to start over,
`docker compose -f docker-compose.dev.yml down -v`.

The command runs on the host, not in a container. It reaches PostgreSQL on `localhost:5432` and the
development Garage object store on `localhost:9000`, and the containerised `api` and `worker` use the
same Garage bucket (`copalibre-dev`), so the emblems it uploads are the ones the API serves and they
survive container rebuilds. The worker scans and thumbnails them like any upload, so they appear a few
seconds after the load.

## What was changed from the source

- **Player surnames are generated; referee names are replaced entirely.** Given names of players are
  kept as published. The replacement depends only on an opaque key and a fixed seed, never on the real
  surname, so it cannot be reversed from the dataset. Anyone holding both the dataset and the source
  site can still re-link a person by club, dorsal and given name; the aim is that no real surname is
  committed, not anonymity against the source.
- Staff (coaches and delegates) are not included.
- Two games were played to 10-2 but officially recorded 8-2 under the regulation goal cap; the
  official score is kept and their scorers are omitted. One game has no report on the source, so it has
  a score and no scorers.
- Club and tournament emblems go through the same background removal the control console applies to an
  uploaded logo (IMG.LY `@imgly/background-removal` 1.7.0, `isnet_quint8` on the CPU, run in headless
  Chromium with the console's model assets). Each logo is then cropped to its content as a centred 1:1
  square and fitted, without distortion, on a transparent 410x512 canvas, the size the product requires.
  The scraper needs the assets from `node apps/web/scripts/copy-background-removal-assets.mjs`; cutouts
  are cached beside the raw downloads, and `--no-cutout` skips them. The model removes the light parts of
  some logos, so `keepOriginalEmblems` in `scrape/config.ts` lists the emblems that keep their published
  background (the tournament emblem, Casa de Italia and Super Patin).

Club names, emblems, schedules and results belong to their owners and are reproduced only as
development sample data; `packages/demo-datasets/datasets/<name>/source.md` records the origin, capture
date and how to ask for removal. They are listed in [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).
This is not an official record.

## Regenerating a dataset

```bash
yarn workspace @copalibre/demo-datasets scrape            # reads the cache; no network when it is populated
yarn workspace @copalibre/demo-datasets scrape --refresh  # fetch the source again
yarn workspace @copalibre/demo-datasets validate          # check committed datasets
```

The scraper is a developer tool and CI never runs it. It sends one request at a time, at least 750 ms
apart, identifies itself, and caches every response under `packages/demo-datasets/cache/`, which is
git-ignored. The committed `dataset.json` is therefore reproducible byte for byte from the cache.

## Using the data in tests

Datasets are plain JSON validated against `packages/demo-datasets/schema/dataset.schema.json`.
`apps/seed/src/demo-loader.ts` is the loader; its integration test and
`apps/api/src/controllers/demo-dataset.integration.test.ts` (which reads the loaded tournament through
the public API) run against PostgreSQL. Production images exclude `packages/demo-datasets/datasets/`
through `.dockerignore`, so they carry no demo data.

Loading the dataset sends no email: its clubs, tournament and entrants are written with `origin: 'import'`, which the notification handlers skip, so a development provider or Mailpit is not flooded.
