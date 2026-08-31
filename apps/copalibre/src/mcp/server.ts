import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Ajv, type ValidateFunction } from 'ajv';
import { readCopalibreVersion } from '../banner.js';
import { adminTools } from './tools/admin-tools.js';
import { descriptorAuthoringTools } from './tools/descriptor-authoring-tools.js';
import { moduleAuthoringTools } from './tools/module-authoring-tools.js';
import { tournamentTools } from './tools/tournament-tools.js';
import type { McpToolDefinition } from './tool.js';

/**
 * The three admin tools, the three module-authoring tools, and the two
 * descriptor-authoring tools are always present; the five tournament-
 * operational tools are only added when both `COPALIBRE_MCP_TOKEN` and
 * `COPALIBRE_API_URL` are configured — a pure-installation MCP
 * session never sees them in `tools/list`, let alone attempts an
 * unauthenticated HTTP call.
 */
export function buildTools(environment: NodeJS.ProcessEnv): readonly McpToolDefinition[] {
  const tools: McpToolDefinition[] = [
    ...adminTools(environment),
    ...moduleAuthoringTools(environment),
    ...descriptorAuthoringTools(),
  ];
  const token = environment.COPALIBRE_MCP_TOKEN;
  const baseUrl = environment.COPALIBRE_API_URL;
  if (token && baseUrl) {
    tools.push(...tournamentTools({ baseUrl, token }));
  }
  return tools;
}

/**
 * The SDK's own `instructions` field — an AI client reads this before
 * choosing which tool to call, so it states what CopaLibre is, the two tool
 * categories, and when each applies, rather than leaving that only to each
 * tool's own description.
 */
export const SERVER_INSTRUCTIONS =
  'CopaLibre is a self-hosted tournament-management platform for clubs, leagues, and federations. ' +
  'This server exposes four kinds of tools. Installation-action tools (copalibre_doctor, ' +
  'copalibre_module_list, copalibre_upgrade_check) always work, need no token, and mirror the ' +
  '`copalibre` CLI’s own maintenance commands — use them to check or operate this installation ' +
  'itself. Module-authoring tools (copalibre_module_scaffold, copalibre_module_validate_local, ' +
  'copalibre_module_submit) also always work and need no token — use them to build a new ' +
  'discipline or tournament-profile module locally (starting from real, valid example content, ' +
  'not a blank schema), validate it, and submit it as a pull request to copalibre-modules. ' +
  'Descriptor-authoring tools (copalibre_descriptor_schema, copalibre_descriptor_validate) also ' +
  'always work and need no token — use copalibre_descriptor_schema to retrieve the discipline ' +
  "descriptor's full shape with field-by-field explanations before drafting one from a sport's " +
  'rulebook, and copalibre_descriptor_validate to check a candidate against the exact validator ' +
  'the installation applies; the full authoring contract, with worked transcriptions of real ' +
  'regulations, is published at /llms-authoring.txt on the help site. Tournament-operational ' +
  'tools (copalibre_get_organization, copalibre_list_tournaments, copalibre_get_tournament, ' +
  'copalibre_create_tournament, copalibre_publish_tournament) act on a running installation over ' +
  'its HTTP API and only appear when COPALIBRE_MCP_TOKEN and COPALIBRE_API_URL are configured — ' +
  'an already-valid bearer token under CopaLibre’s existing OIDC/JWT auth contract; this server ' +
  'does not mint or manage tokens itself.';

/**
 * Uses the SDK's low-level `Server`, not `McpServer`, so every tool's
 * `inputSchema` stays plain JSON Schema validated with `ajv` — this
 * project's standing convention — rather than a zod schema (design.md).
 */
export function buildServer(
  environment: NodeJS.ProcessEnv,
  tools: readonly McpToolDefinition[] = buildTools(environment),
): Server {
  const ajv = new Ajv();
  const validators = new Map<string, ValidateFunction>(
    tools.map((tool) => [tool.name, ajv.compile(tool.inputSchema)]),
  );

  const server = new Server(
    { name: 'copalibre', version: readCopalibreVersion() },
    { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find((candidate) => candidate.name === request.params.name);
    if (!tool) {
      return {
        content: [{ type: 'text' as const, text: `Unknown tool "${request.params.name}"` }],
        isError: true,
      };
    }
    const args = request.params.arguments ?? {};
    const validate = validators.get(tool.name);
    if (validate && !validate(args)) {
      return {
        content: [
          { type: 'text' as const, text: `Invalid arguments: ${ajv.errorsText(validate.errors)}` },
        ],
        isError: true,
      };
    }
    try {
      const text = await tool.handler(args);
      return { content: [{ type: 'text' as const, text }] };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: error instanceof Error ? error.message : String(error) },
        ],
        isError: true,
      };
    }
  });

  return server;
}

export async function startMcpServer(environment: NodeJS.ProcessEnv): Promise<void> {
  const server = buildServer(environment);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
