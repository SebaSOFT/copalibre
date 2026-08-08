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
