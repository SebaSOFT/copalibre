# CopaLibre MCP Server

`copalibre mcp` starts a local, stdio-only [Model Context Protocol](https://modelcontextprotocol.io)
server, letting an AI agent drive a CopaLibre installation instead of parsing CLI text output or
hand-rolling authenticated HTTP calls against `apps/api`.

## Tool set

**Installation actions** (always registered, no token required — run in the same process, calling
the same functions the CLI's own commands call):

| Tool                      | Equivalent to                                               |
| ------------------------- | ----------------------------------------------------------- |
| `copalibre_doctor`        | `copalibre doctor`                                          |
| `copalibre_module_list`   | `copalibre module list`                                     |
| `copalibre_upgrade_check` | `copalibre upgrade-check --target-version <target_version>` |

**Module-authoring actions** (always registered, no token required — operate on the local
filesystem and Git, never `apps/api`):

| Tool                              | Equivalent to                     |
| --------------------------------- | --------------------------------- |
| `copalibre_module_scaffold`       | `copalibre module scaffold`       |
| `copalibre_module_validate_local` | `copalibre module validate-local` |
| `copalibre_module_submit`         | `copalibre module submit`         |

This is the scenario this server's whole design targets: an AI agent reads a sport's rules, asks the
operator any clarifying questions it needs, scaffolds a module locally, edits it, validates it,
installs it into a local development instance for a real try (via the existing
`copalibre module add --source file://...` path — no separate "local run" mechanism exists), and
submits it as a pull request to `copalibre-modules` — all without shelling out to the CLI. See
[`docs/MODULES.md`](MODULES.md) for the full local-authoring sequence.

**Descriptor-authoring actions** (always registered, no token required — operate purely in memory
against modules already imported into this process, no filesystem or Git access):

| Tool                            | Purpose                                                                                                                                                                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `copalibre_descriptor_schema`   | Returns the discipline descriptor's JSON Schema plus a field-by-field explanation of what each declaration governs — the first call before writing any descriptor JSON.                                                                        |
| `copalibre_descriptor_validate` | Validates a candidate descriptor document against the exact validator the installation path applies (shape and cross-field checks alike, e.g. a best-of series span must be odd). Never authors a descriptor, only judges one already drafted. |

Use these ahead of `copalibre_module_scaffold`/`copalibre_module_validate_local`, iteratively, while
drafting a discipline's `artifact.json`.

**Tournament-operational actions** (registered only when both `COPALIBRE_MCP_TOKEN` and
`COPALIBRE_API_URL` are set — without them, none of these appear in the server's tool list, and no
HTTP request is ever attempted):

| Tool                           | HTTP equivalent                                                               |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `copalibre_get_organization`   | `GET /organizations/:alias`                                                   |
| `copalibre_list_tournaments`   | `GET /organizations/:organizationAlias/tournaments`                           |
| `copalibre_get_tournament`     | `GET /organizations/:organizationAlias/tournaments/:tournamentAlias`          |
| `copalibre_create_tournament`  | `POST /organizations/:organizationAlias/tournaments`                          |
| `copalibre_publish_tournament` | `POST /organizations/:organizationAlias/tournaments/:tournamentAlias/publish` |

This is a curated starting set, not an exhaustive wrapper of every `apps/api` endpoint.

## Configuration

| Variable              | Required for                 | Notes                                                                                                           |
| --------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | Installation-action tools    | Same connection string the CLI/`apps/api` already use                                                           |
| `COPALIBRE_MCP_TOKEN` | Tournament-operational tools | An already-valid bearer token under the existing OIDC/JWT contract — this server does not mint or manage tokens |
| `COPALIBRE_API_URL`   | Tournament-operational tools | Base URL of a running `apps/api` instance                                                                       |

## Connecting an MCP client

Point an MCP-capable client at the `copalibre` executable with the `mcp` argument. Example
(Claude Desktop-style `mcpServers` configuration):

```json
{
  "mcpServers": {
    "copalibre": {
      "command": "/path/to/copalibre",
      "args": ["mcp"],
      "env": {
        "DATABASE_URL": "postgres://copalibre:password@localhost:5432/copalibre",
        "COPALIBRE_MCP_TOKEN": "<a valid bearer token>",
        "COPALIBRE_API_URL": "http://localhost:3001"
      }
    }
  }
}
```

Omit `COPALIBRE_MCP_TOKEN`/`COPALIBRE_API_URL` for an installation-actions-only session — no token
is needed, and the tournament-operational tools simply won't be offered.

## For an AI reading this without calling any tool yet

The server advertises an `instructions` field on its `initialize` response — the same summary given
here, in a form an MCP client reads before choosing a tool. If you're instead crawling the help
site's rendered pages, `/llms.txt` (and the fuller `/llms-full.txt`) on a running instance's help
site give the same documentation in a form built for that.
