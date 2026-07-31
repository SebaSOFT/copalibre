# Third-party notices

CopaLibre is licensed under **AGPL-3.0-only** (see `LICENSE`). It incorporates and depends on
third-party open-source software under permissive licenses. This file is the inventory the
project's license policy requires (see chaos-vault:
`20-knowledge-domains/copalibre-platform-architecture.md`, § "License and AGPL policy").

## Policy

- Production dependencies MUST carry a license on the reviewed allowlist enforced by
  `yarn license:check` in CI: `MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`,
  plus the individually reviewed additions listed below.
- A dependency with any other license fails CI and requires a manual review before adoption;
  record the outcome in this file.
- When shadcn/ui-style component source or Radix-derived code is copied into this repository
  (starting at phase `0020-control-web-shell-and-org-dashboard`), each copied file's origin and
  its MIT copyright notice MUST be recorded in the "Vendored source" section below.
- Proprietary shadcn registries, paid blocks, or third-party templates require a separate
  license review before use — none are approved today.

## Reviewed allowlist additions

These SPDX identifiers were reviewed and added to the allowlist because they are permissive,
GPL-compatible, and appear only in transitive dependencies:

| SPDX ID                                   | Rationale                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `0BSD`                                    | Public-domain-equivalent permissive license                                                    |
| `BlueOak-1.0.0`                           | Permissive; common in modern JS tooling                                                        |
| `CC0-1.0`                                 | Public-domain dedication                                                                       |
| `CC-BY-4.0`                               | Attribution-only; data files (e.g. caniuse-lite)                                               |
| `Unlicense`                               | Public-domain dedication                                                                       |
| `Python-2.0`                              | Permissive; appears via argparse                                                               |
| `MPL-2.0`                                 | File-level copyleft with explicit GPL-family compatibility; lightningcss (Astro build tooling) |
| `LGPL-3.0-or-later`                       | AGPL-compatible; sharp's libvips binary (Astro image service)                                  |
| `CC-BY-3.0`                               | Attribution-only; SPDX data files inside the license scanner itself                            |
| `(MIT OR CC0-1.0)`, `(MIT AND CC-BY-3.0)` | Dual/combined expressions of already-allowed licenses                                          |

The scan runs across the full dependency tree (dev and production) — stricter than the
distribution obligation requires, which keeps the gate simple and CI-stable.

## Vendored source

_None yet. First entries arrive with phase `0020-control-web-shell-and-org-dashboard`
(copied shadcn/ui-style components and their Radix dependencies)._
