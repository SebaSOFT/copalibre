# Dependency remediation — 2026-09-09

OpenSpec change `0218-dependabot-vulnerability-remediation` patches nine open
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
