# platform/cli-tournament-operations Specification

## Purpose
Lets an operator read, create, and publish tournaments — and read the organization they belong to —
directly from the `copalibre` CLI, over the same `apps/api` HTTP contract the MCP server's
tournament-operational tools already use, without opening the web control panel.

## Requirements

### Requirement: `copalibre organization get` reads one organization over HTTP

`copalibre organization get <alias>` SHALL read one organization by its alias from `apps/api` over
HTTP, using the credential stored by `copalibre login`, and print its identity.

#### Scenario: Reading an existing organization
- **WHEN** an operator runs `copalibre organization get <alias>` for an organization that exists
- **THEN** the command prints that organization's identity and exits 0

#### Scenario: Reading a nonexistent organization
- **WHEN** an operator runs `copalibre organization get <alias>` for an alias that does not resolve
  to any organization
- **THEN** the command prints the refusal `apps/api` returns and exits non-zero, without inventing
  its own error message

### Requirement: `copalibre tournament` commands mirror the MCP tournament-operational tools

`copalibre tournament list --organization-alias <alias>`, `copalibre tournament get
--organization-alias <alias> --tournament-alias <alias>`, `copalibre tournament create` (with the
same required fields `copalibre_create_tournament` requires), and `copalibre tournament publish
--organization-alias <alias> --tournament-alias <alias>` SHALL each call the exact same `apps/api`
HTTP endpoint its corresponding MCP tool calls, with the same required fields, and SHALL surface the
API's own refusal message verbatim on failure.

#### Scenario: Listing an organization's active tournaments
- **WHEN** an operator runs `copalibre tournament list --organization-alias <alias>`
- **THEN** the command prints that organization's active (non-archived) tournaments, the same set
  `copalibre_list_tournaments` would return for the same organization

#### Scenario: Creating a draft tournament
- **WHEN** an operator runs `copalibre tournament create` with an alias, name, discipline descriptor
  id and version, format, and the public-registration/check-in flags
- **THEN** a draft tournament is created, invisible to public surfaces, exactly as
  `copalibre_create_tournament` would create it from the same inputs

#### Scenario: Publishing a draft tournament
- **WHEN** an operator runs `copalibre tournament publish` for a draft tournament
- **THEN** the tournament becomes visible and operable, exactly as `copalibre_publish_tournament`
  would publish it

#### Scenario: A refusal from the API is shown, not replaced
- **WHEN** any `copalibre tournament` command's underlying HTTP call returns a non-2xx response
- **THEN** the command prints the API's own refusal message and exits non-zero, the same message an
  MCP client would see from the corresponding tool call

### Requirement: Tournament and organization commands require a stored login credential

`copalibre organization get` and every `copalibre tournament` subcommand SHALL require a credential
previously stored by `copalibre login` for the target API, and SHALL NOT fall back to a direct
database connection the way `copalibre module`/`copalibre statistics-rebuild`/`copalibre backup`
already do.

#### Scenario: Running a tournament command without having logged in
- **WHEN** an operator runs any `copalibre tournament` subcommand or `copalibre organization get`
  from a directory with no stored credential
- **THEN** the command fails naming `copalibre login` as the required first step, and makes no
  database connection attempt
