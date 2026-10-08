# panamericano-clubes-2025

Campeonato Panamericano Clubes Senior Varones 2025, copied from a public results portal for use as demo data in development installations.

## Source

- Portal: https://www.wsa.sidgad.com/league/273 (Worldskate America rink hockey results, operated with SIDGAD software)
- Captured: 2026-10-07
- Competition: Campeonato Panamericano Clubes Senior Varones, season 2025/26

## What the dataset holds

24 clubs, 272 players, 9 groups and cups, 72 played games (69 with scorers), 7 venues.

## What was changed

- **Player surnames are replaced** with generated ones; given names are kept as published. **Referee names are replaced entirely** (given name and surname), because the portal prints them inconsistently. The replacement is a function of an opaque key and a fixed seed, never of the real name, so it cannot be reversed from this dataset. Club, venue and result data are unchanged.
- Staff (coaches and delegates) are not included.
- Club and tournament emblems had their background removed with the control console's process (IMG.LY background removal 1.7.0), except tournament, casa-de-italia, super-patin, and were cropped to a centred square on a 410x512 canvas. The organization emblem is the tournament emblem, because the portal publishes none for the organization.
- Two games were played to 10-2 but officially recorded 8-2 under the regulation goal cap; the official score is kept and their scorers are omitted.
- scorer 8343 is missing from the roster; added from the goal row
- game 2672: 12 goal events do not match the official 8-2 (RESULTADO PARTIDO 10-2 REGLAMENTO 8-2); scorers dropped
- game 2680: 12 goal events do not match the official 8-2 (RESULADO PARTIDO 10-2 REGLAMENTO 8-2); scorers dropped
- game 2684: no report; score kept, no scorers

## Attribution and removal

Club names, club and tournament emblems, schedules and results belong to their respective clubs, federations and organisers; they are reproduced here only as development sample data. This is not an official record. If you own any of this material and want it removed, open an issue on the CopaLibre repository and it will be taken out.

## Regenerating

`yarn workspace @copalibre/demo-datasets scrape` reads the portal politely (one request at a time, cached on disk) and rewrites this directory. Re-running with a populated cache makes no network requests.
