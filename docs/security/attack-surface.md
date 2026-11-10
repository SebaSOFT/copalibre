# Attack surface and trust boundaries

The inventory the security gate's controls are written against, and the record of the manual
trust-boundary review. A new surface (a route plane, an outbound destination, an upload route, a
process role) changes this file and gets a control in `controls.json`.

Reviewed 2026-11-10 against the source tree. The review covers code paths, not a running
installation; the runtime controls cover that.

## Entry points

| Surface                                           | Who reaches it                      | Authentication                                   | Controls                                                                         |
| ------------------------------------------------- | ----------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| Gateway (`COPALIBRE_PORT`)                        | Anyone on the network               | None itself; routes `/api`, `/events`, the rest  | `only-gateway-published`, `security-headers-runtime`                             |
| API, 41 `public-read` routes                      | Anyone                              | None; projections only                           | `route-access-declared`, `request-validation`, `shared-rate-limits`              |
| API, 6 `authenticated-interaction` routes         | Participants                        | Bearer or session cookie, participant scope      | `jwt-verification`, `csrf-signed-double-submit`                                  |
| API, 155 `admin-control` routes                   | Operators, super-admins             | Bearer or session cookie, capability per route   | `route-access-declared`, `organization-isolation`, `admin-escalation-runtime`    |
| Events: public, TV, control streams and long poll | Viewers, kiosks, operators          | Public, display token, or session                | `shared-rate-limits`, `forwarded-address-trust`                                  |
| Web role                                          | Anyone                              | Session cookie for Control                       | `content-security-policy`, `html-sinks-reviewed`, `browser-holds-no-credentials` |
| CLI (`copalibre`)                                 | Host operators                      | Host shell and `.env`; bootstrap token for setup | `production-settings`, `publication-supply-chain`                                |
| MCP server                                        | An agent with `COPALIBRE_MCP_TOKEN` | Bearer token under the API contract              | Same as the API routes it calls                                                  |
| Worker, scheduler                                 | No inbound traffic                  | Read the outbox and leases from PostgreSQL       | `database-privileges-runtime`                                                    |

The route counts come from `@SecurityPlaneTag` declarations; an undeclared route fails closed as
`admin-control`.

## Uploads and imports

| Route                                       | Limits                                                                                       | Control                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------- |
| Person photo, club and organization emblems | Authenticated, 10 MiB decoded, dimensions checked, quarantined until the malware scan passes | `media-upload-validation` |
| CSV participant import                      | `org.manage-tournament-data`, 4 MiB, validated by the worker before commit                   | `upload-bypass-runtime`   |
| Module install and authored modules         | Super-admin; alias, repository and branch validated; allow-listed sources only               | `module-source-boundary`  |

## Outbound connections

The server opens connections only to destinations the operator configures:

- the identity provider's JWKS (`COPALIBRE_JWKS_URI`);
- the email provider (Resend, Brevo, Mailgun or SMTP, from `.env`);
- object storage and clamd on the internal network;
- module sources: the curated repository, or a source the operator allow-listed in
  `COPALIBRE_MODULE_SOURCE_ALLOWLIST`, fetched with git restricted to `file`, `git`, `http`,
  `https` and `ssh` transports;
- the GitHub CLI, for a super-admin submitting an authored module upstream.

No request field is fetched as a URL, so there is no server-side request forgery path from a
request body. Email bodies are built from escaped values, with the logo URL derived from
`COPALIBRE_APP_URL`.

## Commands the server runs

`git` and `gh`, for module fetch and submission, with arguments built from validated values and
`--` before positional repository URLs. No request value reaches a shell.

## Supply chain

Workflow actions are pinned by commit SHA, publication tools come from the audited lockfile, CLI
assets upload only from the commit the release tag names, and dependency advisories are checked
before every publication. See `publication-supply-chain` and `dependency-advisories`.

## Not applicable

Prices and payments: no pricing, checkout or payment flow exists. `no-payment-surface` fails as soon
as one appears.

## Open

- The runtime controls need the disposable production-profile deployment.
- Candidate images are not yet scanned before publication.
- Suspicious-activity alerting to a test receiver does not exist yet.
