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
installation-action vs. tournament-operational tool categories, and when each applies. Every
registered tool's `description` SHALL state what it does, when to use it, and what it requires (for
example, a required token), not merely its name in prose.

#### Scenario: The server advertises instructions

- **WHEN** an MCP client performs the initialization handshake against `copalibre mcp`
- **THEN** the server's response includes a non-empty `instructions` string

#### Scenario: A tool description explains when to use it

- **WHEN** an MCP client reads a tournament-operational tool's description from `tools/list`
- **THEN** the description states that the tool requires `COPALIBRE_MCP_TOKEN`, not only what HTTP
  call it makes

### Requirement: Module-authoring tools are always available

`copalibre_module_scaffold`, `copalibre_module_validate_local`, and `copalibre_module_submit` SHALL
be registered on every `copalibre mcp` invocation, requiring no API token — they operate on the
local filesystem and Git, never `apps/api`.

#### Scenario: Module-authoring tools work without any token configured

- **WHEN** `copalibre mcp` starts with no `COPALIBRE_MCP_TOKEN` configured
- **THEN** `copalibre_module_scaffold`, `copalibre_module_validate_local`, and
  `copalibre_module_submit` are listed and callable
