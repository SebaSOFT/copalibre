# Cutting a release

CopaLibre has one version for the whole product — every workspace `package.json` (and the repository
root's) carries the same version string. The version that matters at runtime lives in
`apps/copalibre/package.json`: it's what the `copalibre` CLI's startup banner and `--version` print,
and it's what `.github/workflows/release.yml` reads to decide what to tag and publish.

## Steps

1. **Bump the version.** Set the same new version in every `apps/*/package.json`, every
   `packages/*/package.json`, and the root `package.json`. There's no script for this yet — it's a
   deliberate, reviewable diff, not an automated bump.
2. **Open a pull request from `develop` into `main`.** This PR runs the full CI suite, including the
   end-to-end and deploy-verification chain (`e2e-tests`, `build`, `deployment-e2e`,
   `deploy-smoke-test`) — these are skipped on routine `develop`-targeting PRs and only run for a PR
   targeting `main`, so this is the first time a change gets that full gate.
3. **Merge once CI is green.** The merge is a push to `main`, which triggers `release.yml`
   automatically. Nothing else to do.

## What happens automatically on merge

`release.yml` reads the version from `apps/copalibre/package.json`. If a `v{version}` git tag doesn't
already exist, it:

- creates and pushes that tag,
- builds and pushes both release images —
  [`ghcr.io/sebasoft/copalibre`](https://ghcr.io/sebasoft/copalibre) (the multi-role runtime image) and
  [`ghcr.io/sebasoft/copalibre-web`](https://ghcr.io/sebasoft/copalibre-web) (the static web image) —
  each tagged with the exact version and with `latest`,
- creates a GitHub Release with auto-generated notes.

If the tag already exists (a merge to `main` that didn't carry a version bump — a hotfix cherry-pick,
say), the workflow completes without doing any of the above. This is intentional, not a failure: a
version-less merge to `main` is never a release.

## What this does not do

- No changelog is hand-maintained; the GitHub Release's auto-generated notes are what exists today.
- Nothing validates that a version bump is the "correct" major/minor/patch increment — that judgment
  stays with whoever bumps it.
- No workspace package is published to npm. Every package stays private; only the two container images
  are published.
