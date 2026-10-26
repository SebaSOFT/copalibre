# Contributing

CopaLibre is a self-hosted tournament-management system for organizers. Read [`PRODUCT.md`](PRODUCT.md)
before proposing larger work: the project has no hosted or commercial tier, now or planned. Open an
issue first for substantial or cross-cutting changes so the scope can be discussed before code is
written.

## Licence and third-party work

Contributions are distributed under the project's AGPL-3.0-only licence in [`LICENSE`](LICENSE).
List copied third-party code, components and assets in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Set up a development environment

Use the Node version pinned in `.nvmrc`, then install the locked workspace dependencies:

```sh
nvm use
yarn install --immutable
```

Start the local development stack with `copalibre dev`. To load the Panamericano demo, install its
`rink-hockey` discipline and run:

```sh
copalibre module add rink-hockey
copalibre dev demo panamericano-clubes-2025 --anchor today --played-until now
```

For a demo administrator invitation, pass `--with-admin <email>` to the demo command. To invite an
administrator to an existing organization, use `copalibre organization add-admin --help`. These are
supported CLI flows; do not create accounts or role assignments by editing the database. See
[`docs/DEMO-DATA.md`](docs/DEMO-DATA.md) for module, object-storage and demo setup details, and
[`docs/self-hosting.md`](docs/self-hosting.md) for installation details.

## Propose a change

Use OpenSpec for behavior changes: write a self-contained proposal and specification before
implementation. Keep one change on one `change/<change-id>` branch and open one pull request against
`develop`. Link the proposal in the pull request description and explain behavior, verification and
any migration or configuration impact.

## Checks before a pull request

Follow [`AGENTS.md`](AGENTS.md#ci-and-infrastructure) for the current lint, type, test, coverage,
OpenSpec and infrastructure gates. It is the source of truth for exact commands; this guide does not
duplicate that list.

## Design and interface copy

[`DESIGN.md`](DESIGN.md) is the visual contract. For any pull request that changes catalogue strings,
list every changed key with its language and old and new text in the pull request body. Use
`node scripts/list-changed-strings.mjs` for control and public message catalogues; list email-copy
changes manually by language and field. For every UI pull request, include before/after screenshot
pairs for each touched screen: 1440×900 desktop, 390×844 mobile and 1920×1080 TV where applicable.
Capture them in Spanish with the Panamericano demo, commit them under `docs/assets/screenshots` and
embed them in the pull request body.

## Correct a translation

Interface catalogues are organized by surface:

- Control: `apps/web/src/control/i18n/messages.<locale>.ts`.
- Public and TV: `apps/web/src/lib/i18n/public-messages.<locale>.ts`.
- Emails: `apps/worker/src/notifications/email-copy.ts`.
- Help: English pages are under `apps/web/src/content/docs/help/`; translated pages are under
  `apps/web/src/content/docs/<locale>/help/`.

Check control and public catalogue-key completeness across the eight interface languages with
`node scripts/check-atomic-composition.mjs`; `node scripts/check-copy-voice.mjs` checks interface and
email copy rules. Help-page locale parity is checked with
`node scripts/check-help-locale-parity.mjs`. Consult [`docs/i18n-glossary.md`](docs/i18n-glossary.md)
for domain terms. Update the relevant language section in
[`docs/i18n/REVIEW-LEDGER.md`](docs/i18n/REVIEW-LEDGER.md) in the same pull request. A translation is
marked reviewed only after a fluent reader has checked it; green automated checks do not count as a
human review.

## Report a security issue

Use GitHub's [private vulnerability reporting](https://github.com/SebaSOFT/copalibre/security/advisories/new).
Do not disclose vulnerabilities in a public issue or pull request. See [`SECURITY.md`](SECURITY.md)
for the supported release line and report details.
