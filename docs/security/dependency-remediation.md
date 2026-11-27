# Dependency remediation

## 2026-11-13 — `astro` and `@astrojs/node` image endpoint and dynamic tag advisories

Two advisories against Astro, published 2026-11-13, failed the workspace audit in CI on the locked
`astro` 7.4.1 and `@astrojs/node` 11.1.9:

- [GHSA-r3h5-4585-7x3w](https://github.com/advisories/GHSA-r3h5-4585-7x3w) (medium; `astro`
  `>= 5.14.3, <= 7.4.6`, `@astrojs/node` `<= 11.1.11`): on a case-sensitive filesystem the image
  endpoint can read files from a case-variant sibling of the output directory.
- [GHSA-mh32-jxcr-mh9f](https://github.com/advisories/GHSA-mh32-jxcr-mh9f) (low; `astro` `<= 7.4.4`):
  attribute injection through dynamic tag names allows XSS.

Both are direct dependencies of `apps/web`. Its ranges move to `astro` `^7.4.11` and `@astrojs/node`
`^11.1.12`, the newest releases past the 24-hour release-age gate (7.4.12 and 11.1.13 were published the
same day as the advisories; [a922cda3](https://github.com/SebaSOFT/copalibre/commit/a922cda3)). `scripts/dependency-security.test.mjs` raises the `astro` floor from 7.2.8
to 7.4.7, the first patched release, and adds an `@astrojs/node` floor of 11.1.12, the first release
outside the affected range.

## 2026-11-13 — `hono` middleware, validator and `css` helper advisories

Five advisories against `hono`, published 2026-11-12, failed the Dependabot audit in CI on the
locked 4.13.13:

- [GHSA-4m76-xfj5-7975](https://github.com/advisories/GHSA-4m76-xfj5-7975) (medium, `< 4.13.16`):
  `mount()` and `app.mount()` can forward a path that bypasses middleware scoped inside the mount
  prefix.
- [GHSA-h7mg-cq63-vhpq](https://github.com/advisories/GHSA-h7mg-cq63-vhpq) (medium,
  `>= 4.1.4, <= 4.13.15`): `RegExpRouter` skips wildcard middleware for some route sets and for
  paths with an encoded line terminator.
- [GHSA-3gg2-335m-rxc6](https://github.com/advisories/GHSA-3gg2-335m-rxc6) (low,
  `>= 3.12.0, <= 4.13.15`): the `css` helper does not escape a closing tag split between the
  template and an interpolated value, allowing HTML injection.
- [GHSA-46wx-v44x-9hh2](https://github.com/advisories/GHSA-46wx-v44x-9hh2) (medium, `< 4.13.16`):
  `csrf()` does not check requests sent by hyperlink auditing (`text/ping`).
- [GHSA-4h7h-rv7c-7m2v](https://github.com/advisories/GHSA-4h7h-rv7c-7m2v) (medium,
  `>= 4.5.1, <= 4.13.15`): `validator('form')` skips validation for `multipart/form-data` requests
  with extra parameters.

All five are patched in 4.13.16. The package reaches the lockfile only through
`@modelcontextprotocol/sdk` in `apps/copalibre`; no CopaLibre source imports `hono` directly.

The root resolution moves from 4.13.13 to 4.13.18
([0c6c65d4](https://github.com/SebaSOFT/copalibre/commit/0c6c65d4)), released 2026-11-11 and so past
the 24-hour release-age gate. `scripts/dependency-security.test.mjs` raises the `hono` floor from
4.13.11 to 4.13.16, the first patched release, and the five events are recorded in
`scripts/dependency-security-incidents.json`.

## 2026-11-12 — `basic-ftp` MLSD listing parser advisory

[GHSA-5pm8-86m8-9m6r](https://github.com/advisories/GHSA-5pm8-86m8-9m6r), published 2026-11-12,
reports that a `__proto__` fact name in an MLSD directory listing throws an uncaught `TypeError` in
`Client.list()`, a denial of service. It affects `basic-ftp <= 6.2.3`, and the Dependabot audit in
CI failed on the locked 6.2.3. The package reaches the lockfile only through the Lighthouse CI tool
at the repository root: `@lhci/cli` → `proxy-agent` → `pac-proxy-agent` → `get-uri` → `basic-ftp`.
Nothing in CopaLibre opens an FTP connection; the fix is still taken so the audit stays clean.

The root resolution moves from 6.2.3 to 6.2.6
([0d302662](https://github.com/SebaSOFT/copalibre/commit/0d302662)), released 2026-11-04 and so past
the 24-hour release-age gate. `scripts/dependency-security.test.mjs` gains a floor of 6.2.4, the first
patched release, and the event is recorded in `scripts/dependency-security-incidents.json`.

## 2026-11-12 — `@hono/node-server` path and upgrade advisories

Two medium advisories against `@hono/node-server` opened alerts #115 and #116 on 2026-11-12, and
the Dependabot audit in CI failed on the locked 2.1.3:

- [GHSA-jpvv-r467-5p4w](https://github.com/advisories/GHSA-jpvv-r467-5p4w): a backslash in the
  request path is parsed as a path separator, bypassing path-based access control at a reverse proxy.
- [GHSA-qv5m-9pm6-hqp3](https://github.com/advisories/GHSA-qv5m-9pm6-hqp3): an unhandled
  `ECONNRESET` during an asynchronous WebSocket upgrade crashes the process.

Both affect `>= 2.0.0, < 2.1.6`. The package reaches the lockfile only through
`@modelcontextprotocol/sdk` in `apps/copalibre` (the `copalibre mcp` server). The root resolution
moves from 2.1.3 to 2.1.6 ([fcaf12ea](https://github.com/SebaSOFT/copalibre/commit/fcaf12ea)), released
2026-11-02 and so past the 24-hour release-age gate. `scripts/dependency-security.test.mjs` raises
the package's floor to 2.1.6, and both events are recorded in
`scripts/dependency-security-incidents.json`. After the change, `node scripts/check-dependabot-alerts.mjs`
reports 42 open alerts, all patched in checkout, and `yarn npm audit --all --recursive
--no-deprecations` reports nothing. The alerts close when a release reaches `main`.

## 2026-11-10 — open alerts behind `main`

GitHub reports 40 open Dependabot alerts (24 GHSAs, nine packages). None of them is
vulnerable in the checkout: every locked instance of every affected package is at or above
its published fix, and `yarn npm audit --all --recursive --no-deprecations` reports nothing.
The alerts stay open because GitHub evaluates the lockfile on `main`, which is still at
`7e866d47` (2026-10-09). They close only after a release reaches `main` and Dependabot
reprocesses it; merging to `develop` does not close them, and none has been dismissed.

Inventory, taken 2026-11-10 17:32 UTC on `develop` with `node scripts/check-dependabot-alerts.mjs --report`:

| Classification                      | Alerts |
| ----------------------------------- | -----: |
| patched in checkout, pending `main` |     40 |
| vulnerable in checkout              |      0 |
| removed dependency                  |      0 |
| reviewed unpatched (accepted risk)  |      0 |
| unresolved                          |      0 |

| Package             | Alerts                                                       | Severity          | First patched (per affected line) | Locked now             | Remediation                                                       | Advisories                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------ | ----------------- | --------------------------------- | ---------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@hono/node-server` | #114                                                         | medium            | 2.1.3                             | 2.1.3                  | [cfbbe306](https://github.com/SebaSOFT/copalibre/commit/cfbbe306) | [GHSA-rmxm-3fg6-px4f](https://github.com/advisories/GHSA-rmxm-3fg6-px4f)                                                                                                                                                                                                                                                                                                                                                                                   |
| `body-parser`       | #99                                                          | high              | 2.4.0                             | 2.4.0                  | [f91cdb2e](https://github.com/SebaSOFT/copalibre/commit/f91cdb2e) | [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828)                                                                                                                                                                                                                                                                                                                                                                                   |
| `fast-uri`          | #89, #90, #91, #92, #96, #102, #103, #104                    | low, medium       | 3.1.9, 4.2.3                      | 3.1.9, 4.2.3           | [f91cdb2e](https://github.com/SebaSOFT/copalibre/commit/f91cdb2e) | [GHSA-xhq7-xmqj-769h](https://github.com/advisories/GHSA-xhq7-xmqj-769h), [GHSA-333x-w4r6-6crp](https://github.com/advisories/GHSA-333x-w4r6-6crp), [GHSA-w74x-v6f9-j3xg](https://github.com/advisories/GHSA-w74x-v6f9-j3xg), [GHSA-wjr9-j795-jxcr](https://github.com/advisories/GHSA-wjr9-j795-jxcr)                                                                                                                                                     |
| `ip-address`        | #98                                                          | medium            | 10.7.4                            | 10.7.4                 | [95eff06a](https://github.com/SebaSOFT/copalibre/commit/95eff06a) | [GHSA-rxp7-6hxx-x8q5](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5)                                                                                                                                                                                                                                                                                                                                                                                   |
| `nodemailer`        | #100, #101, #110                                             | medium            | 10.0.13, 10.1.4                   | 10.1.7                 | [d8532d75](https://github.com/SebaSOFT/copalibre/commit/d8532d75) | [GHSA-g73g-hqqh-jr95](https://github.com/advisories/GHSA-g73g-hqqh-jr95), [GHSA-m943-m63m-w62w](https://github.com/advisories/GHSA-m943-m63m-w62w), [GHSA-8c8m-p3m8-cjg8](https://github.com/advisories/GHSA-8c8m-p3m8-cjg8)                                                                                                                                                                                                                               |
| `storybook`         | #81, #82, #87, #88                                           | critical, high    | 10.6.2                            | 10.6.2                 | [5c794a6a](https://github.com/SebaSOFT/copalibre/commit/5c794a6a) | [GHSA-px85-f4q5-jh77](https://github.com/advisories/GHSA-px85-f4q5-jh77), [GHSA-f2ph-cmg5-wxc8](https://github.com/advisories/GHSA-f2ph-cmg5-wxc8)                                                                                                                                                                                                                                                                                                         |
| `undici`            | #93, #94, #95, #97, #106, #107, #108, #109, #111, #112, #113 | high, medium      | 6.29.1, 8.12.2                    | 6.29.1, 8.12.2, 8.12.3 | [f91cdb2e](https://github.com/SebaSOFT/copalibre/commit/f91cdb2e) | [GHSA-qrxm-fqhp-jwvm](https://github.com/advisories/GHSA-qrxm-fqhp-jwvm), [GHSA-2m5v-pch6-74hx](https://github.com/advisories/GHSA-2m5v-pch6-74hx), [GHSA-9fm3-97px-rjf6](https://github.com/advisories/GHSA-9fm3-97px-rjf6), [GHSA-55wc-3pg8-jfw6](https://github.com/advisories/GHSA-55wc-3pg8-jfw6), [GHSA-4qv8-2p9j-2685](https://github.com/advisories/GHSA-4qv8-2p9j-2685), [GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c) |
| `vite`              | #75, #76, #77, #78, #79, #80, #83, #84, #85, #86             | high, low, medium | 8.1.6                             | 8.3.4                  | [ee4c8e40](https://github.com/SebaSOFT/copalibre/commit/ee4c8e40) | [GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22), [GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw), [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw), [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm), [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv)                                                                           |
| `zod`               | #105                                                         | high              | 4.6.6                             | 4.6.7                  | [f91cdb2e](https://github.com/SebaSOFT/copalibre/commit/f91cdb2e) | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)                                                                                                                                                                                                                                                                                                                                                                                   |

Every fix is a root resolution in `package.json`; no package was removed and no
application code changed. The registered unpatched advisories (`braces`, `sprintf-js`)
have no open alert. Transitive remediations are recorded, with their dependency paths, in
`scripts/dependency-security-incidents.json`.

### Guards

- `scripts/check-dependabot-alerts.mjs` classifies every open alert as patched in checkout,
  vulnerable in checkout, removed dependency, reviewed unpatched or unresolved. Accepted risk
  is never reported as patched. A malformed alert record, a failed or non-JSON page, or a
  package with no locked instance that is not in the reviewed removal register fails the
  audit instead of reading as clean. `--report` prints the nonsecret inventory above.
- `scripts/dependency-security.test.mjs` holds every locked instance at its reviewed floor
  per major line, compared with semver: `ip-address` 10.7.4 and `@hono/node-server` 2.1.3
  joined the floors with this inventory.

### Still to do

After a release reaches `main`, run the audit again and record which of these alerts GitHub
actually closed, and any that it reopened or newly opened.

## 2026-09-09 — first remediation

The Dependabot vulnerability remediation patches nine open
Dependabot alerts reported against `yarn.lock`. The GitHub API was checked on
2026-09-09; closure remains pending release to the default branch, `main`.
Merging to `develop` does not establish that GitHub has closed these alerts.

| Package                     | Alerts             | Previous version | Patched version | Advisories                                                                                                                                                                                                                                                                                             |
| --------------------------- | ------------------ | ---------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fast-uri` v3               | #22, #23, #26, #27 | 3.1.5            | 3.1.6           | [GHSA-5jgf-p345-68v8](https://github.com/advisories/GHSA-5jgf-p345-68v8), [GHSA-fph4-wmhf-6fwf](https://github.com/advisories/GHSA-fph4-wmhf-6fwf), [GHSA-jqff-g426-hqxp](https://github.com/advisories/GHSA-jqff-g426-hqxp), [GHSA-f65p-4m7j-42xc](https://github.com/advisories/GHSA-f65p-4m7j-42xc) |
| `qs`                        | #24, #25           | 6.15.3           | 6.16.0          | [GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx), [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g)                                                                                                                                                     |
| `@ai-sdk/provider-utils` v4 | #28                | 4.0.5            | 4.0.33          | [GHSA-866g-f22w-33x8](https://github.com/advisories/GHSA-866g-f22w-33x8)                                                                                                                                                                                                                               |
| `svgo` v4                   | #29, #30           | 4.0.2            | 4.1.0           | [GHSA-w27v-7q3p-w38r](https://github.com/advisories/GHSA-w27v-7q3p-w38r), [GHSA-4vpr-x523-8j87](https://github.com/advisories/GHSA-4vpr-x523-8j87)                                                                                                                                                     |

Root resolutions preserve the separate `fast-uri` v4 line at 4.1.3. Framework and
documentation package pins stay in place. These dependency updates require no
database migration or deployment configuration change.

The CI `install` job runs `node --test scripts/dependency-security.test.mjs` after
`yarn install --immutable`. It checks every locked instance of these packages,
including duplicates, and requires stable versions at or above the reviewed
floor for each supported major. Adding a major requires reviewing its advisories
and updating the guard. This is a regression guard for these known advisories;
Dependabot remains responsible for discovering new ones.

After release reaches `main`, recheck alerts #22–#30 and record GitHub's actual
closure state. Do not manually dismiss alerts to represent an unreleased fix.
