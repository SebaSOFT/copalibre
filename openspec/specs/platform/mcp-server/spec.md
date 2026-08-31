# platform/mcp-server Specification

## Purpose

Lets an AI agent drive a CopaLibre installation — both installing/operating the CLI's own
maintenance actions and acting on a running tournament — through the Model Context Protocol instead
of parsing CLI text output or hand-rolling authenticated HTTP calls against `apps/api`.

## Requirements

### Requirement: copalibre mcp is a local stdio-only MCP server

`copalibre mcp` SHALL start a Model Context Protocol server communicating exclusively over stdio —
no HTTP/SSE transport SHALL be offered by this command.

#### Scenario: The server speaks MCP over stdio

- **WHEN** an MCP client spawns `copalibre mcp` and performs the MCP initialization handshake over
  its stdin/stdout
- **THEN** the server responds according to the Model Context Protocol and lists its available tools

### Requirement: Installation-action tools are always available

`copalibre_doctor`, `copalibre_module_list`, and `copalibre_upgrade_check` SHALL be registered on
every `copalibre mcp` invocation, requiring no API token, and SHALL execute the same logic as their
corresponding CLI commands.

#### Scenario: Installation tools work without any token configured

- **WHEN** `copalibre mcp` starts with no `COPALIBRE_MCP_TOKEN` configured
- **THEN** `copalibre_doctor`, `copalibre_module_list`, and `copalibre_upgrade_check` are listed and
  callable

### Requirement: Tournament-operational tools require an explicit token

`copalibre_get_organization`, `copalibre_list_tournaments`, `copalibre_get_tournament`,
`copalibre_create_tournament`, and `copalibre_publish_tournament` SHALL call `apps/api` over HTTP
using a bearer token from `COPALIBRE_MCP_TOKEN`, and SHALL NOT be registered unless both
`COPALIBRE_MCP_TOKEN` and `COPALIBRE_API_URL` are configured.

#### Scenario: Tournament tools are absent without a configured token

- **WHEN** `copalibre mcp` starts with `COPALIBRE_MCP_TOKEN` unset
- **THEN** none of the tournament-operational tools appear in the tool list, and no HTTP request to
  `apps/api` is ever attempted by this server instance

#### Scenario: A tournament-operational tool call is authenticated

- **WHEN** a tournament-operational tool is called with `COPALIBRE_MCP_TOKEN` configured
- **THEN** the resulting `apps/api` request carries `Authorization: Bearer <token>`

### Requirement: The server and its tools are self-explanatory to an AI client

`copalibre mcp` SHALL advertise a top-level `instructions` string explaining what CopaLibre is, the
installation-action, tournament-operational and descriptor-authoring tool categories, and when each
applies. Every registered tool's `description` SHALL state what it does, when to use it, and what it
requires (for example, a required token), not merely its name in prose.

The `instructions` string SHALL state where an agent can retrieve the authoring contract in full, so an
agent that needs more than a tool description knows what to fetch rather than inferring the artifact's
shape from examples.

#### Scenario: The server advertises instructions

- **WHEN** an MCP client performs the initialization handshake against `copalibre mcp`
- **THEN** the server's response includes a non-empty `instructions` string

#### Scenario: A tool description explains when to use it

- **WHEN** an MCP client reads a tournament-operational tool's description from `tools/list`
- **THEN** the description states that the tool requires `COPALIBRE_MCP_TOKEN`, not only what HTTP
  call it makes

#### Scenario: The instructions name the authoring path

- **WHEN** an MCP client reads the server's `instructions`
- **THEN** it learns that descriptor authoring is a supported category, which tools serve it, and where
  the full authoring contract can be retrieved

### Requirement: Module-authoring tools are always available

`copalibre_module_scaffold`, `copalibre_module_validate_local`, and `copalibre_module_submit` SHALL
be registered on every `copalibre mcp` invocation, requiring no API token — they operate on the
local filesystem and Git, never `apps/api`.

#### Scenario: Module-authoring tools work without any token configured

- **WHEN** `copalibre mcp` starts with no `COPALIBRE_MCP_TOKEN` configured
- **THEN** `copalibre_module_scaffold`, `copalibre_module_validate_local`, and
  `copalibre_module_submit` are listed and callable

### Requirement: Descriptor-authoring tools are always available
`copalibre_descriptor_schema` and `copalibre_descriptor_validate` SHALL be registered on every
`copalibre mcp` invocation, requiring no API token — they read the schema the installation already
carries and validate a candidate locally, never calling `apps/api`.

`copalibre_descriptor_schema` SHALL return the machine-readable discipline-descriptor schema together
with, for each field, what that field governs while a competition is running. `copalibre_descriptor_validate`
SHALL accept a candidate descriptor and return either acceptance or the validation errors, each naming
the path within the descriptor that caused it.

Validation SHALL be the same validation the platform applies when a module is installed. An agent SHALL
NOT be able to produce a descriptor that this tool accepts and the installation later refuses.

#### Scenario: Authoring tools work without any token configured
- **WHEN** `copalibre mcp` starts with no `COPALIBRE_MCP_TOKEN` configured
- **THEN** `copalibre_descriptor_schema` and `copalibre_descriptor_validate` are listed and callable

#### Scenario: The schema arrives with its meanings, not only its types
- **WHEN** an agent calls `copalibre_descriptor_schema`
- **THEN** the response carries each field's type constraints and an explanation of what the field
  causes during a competition, so the agent can map a regulation onto it rather than only satisfy it

#### Scenario: A rejected candidate names where it is wrong
- **WHEN** an agent submits a descriptor declaring a statistic with an aggregation mode that does not
  exist
- **THEN** validation fails naming the path of the offending declaration, not only that the descriptor
  is invalid

#### Scenario: Local acceptance predicts installation acceptance
- **WHEN** `copalibre_descriptor_validate` accepts a candidate descriptor
- **THEN** installing that descriptor as a module does not fail validation, because both apply the same
  rules
