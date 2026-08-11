---
title: MCP for AI
description: How an AI can operate CopaLibre through copalibre mcp.
---

`copalibre mcp` starts a local [Model Context Protocol](https://modelcontextprotocol.io) server,
over stdio only — no HTTP/SSE transport. An MCP client (for example, an AI agent) starts the
process and communicates over its standard input/output; log messages (the banner, etc.) go to
stderr, never mixed with the protocol.

## Installation tools

Always available, no token to configure — they run the exact same logic as their equivalent CLI
commands, in the same process:

- **`copalibre_doctor`**: validates configuration and dependencies (same as `copalibre doctor`).
- **`copalibre_module_list`**: lists installed modules.
- **`copalibre_upgrade_check`**: checks module compatibility and pending migrations against a target
  version (`target_version`), same as `copalibre upgrade-check`.

## Module-authoring tools

Always available, no token — they operate on the local filesystem and Git, never on `apps/api`:

- **`copalibre_module_scaffold`**: generates a structurally valid module package, seeded from an
  already-valid catalogue document, as a tagged local Git repository.
- **`copalibre_module_validate_local`**: validates a local package without searching for or
  installing it.
- **`copalibre_module_submit`**: forks `copalibre-modules`, publishes the module on a new branch,
  and opens a pull request.

This is the full scenario this server exists for: an AI reads a sport's rules, asks the operator the
details it needs, assembles the module locally, validates it, installs it into a local development
installation to actually try it out (via `copalibre module add --source file://...`, no separate
mechanism), and submits it as a pull request — all without leaving the MCP protocol.

## Tournament-operation tools

Only registered when `COPALIBRE_MCP_TOKEN` and `COPALIBRE_API_URL` are configured — without a token,
they don't even appear in the server's tool list, and no HTTP call is ever attempted.
`COPALIBRE_MCP_TOKEN` is a bearer token already valid under the same OIDC/JWT authentication
contract the rest of the API uses; this command does not issue or manage tokens, only forwards them.

- **`copalibre_get_organization`**: reads an organization by its alias.
- **`copalibre_list_tournaments`**: lists an organization's active (non-archived) tournaments.
- **`copalibre_get_tournament`**: reads a tournament by its alias within an organization.
- **`copalibre_create_tournament`**: creates a tournament in draft state.
- **`copalibre_publish_tournament`**: publishes a draft tournament's configuration.

This is an initial, curated set, not an exhaustive mirror of every `apps/api` endpoint — expanding it
later is expected work, not a fixed limit.

## Configuring an MCP client

A typical MCP client starts `copalibre mcp` as a subprocess, passing the required environment
variables (`DATABASE_URL`, and optionally `COPALIBRE_MCP_TOKEN`/`COPALIBRE_API_URL` for the
tournament tools). See [`docs/MCP.md`](https://github.com/SebaSOFT/copalibre/blob/develop/docs/MCP.md)
in the repository for a complete configuration example.

## Documentation for AI

The MCP server announces its own `instructions` in the `initialize` response — the same summary as
this page, in the form an MCP client reads before choosing a tool. This same instance also publishes
`/llms.txt` and `/llms-full.txt` at the help site's root, for an AI that instead crawls the rendered
pages.
