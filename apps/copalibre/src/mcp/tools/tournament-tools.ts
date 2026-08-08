import { apiGet, apiPost, type ApiClientConfig } from '../api-client.js';
import type { McpToolDefinition } from '../tool.js';

/**
 * The five tournament-operational tools (0047 design): a curated starting
 * set — get/list/create/publish a tournament and read an organization — not
 * an exhaustive wrapper of every `apps/api` endpoint. Each calls `apps/api`
 * over HTTP with the bearer token `server.ts` only builds this module with
 * when `COPALIBRE_MCP_TOKEN` and `COPALIBRE_API_URL` are both configured.
 */
export function tournamentTools(config: ApiClientConfig): readonly McpToolDefinition[] {
  return [
    getOrganizationTool(config),
    listTournamentsTool(config),
    getTournamentTool(config),
    createTournamentTool(config),
    publishTournamentTool(config),
  ];
}

function stringArgument(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

function getOrganizationTool(config: ApiClientConfig): McpToolDefinition {
  return {
    name: 'copalibre_get_organization',
    description: 'Read an organization by its alias.',
    inputSchema: {
      type: 'object',
      properties: { alias: { type: 'string' } },
      required: ['alias'],
    },
    handler: async (args) => {
      const alias = stringArgument(args, 'alias');
      const organization = await apiGet(config, `/organizations/${encodeURIComponent(alias)}`);
      return JSON.stringify(organization, null, 2);
    },
  };
}

function listTournamentsTool(config: ApiClientConfig): McpToolDefinition {
  return {
    name: 'copalibre_list_tournaments',
    description: "List an organization's active (non-archived) tournaments.",
    inputSchema: {
      type: 'object',
      properties: { organization_alias: { type: 'string' } },
      required: ['organization_alias'],
    },
    handler: async (args) => {
      const organizationAlias = stringArgument(args, 'organization_alias');
      const tournaments = await apiGet(
        config,
        `/organizations/${encodeURIComponent(organizationAlias)}/tournaments`,
      );
      return JSON.stringify(tournaments, null, 2);
    },
  };
}

function getTournamentTool(config: ApiClientConfig): McpToolDefinition {
  return {
    name: 'copalibre_get_tournament',
    description: 'Read a tournament by its organization-scoped alias.',
    inputSchema: {
      type: 'object',
      properties: {
        organization_alias: { type: 'string' },
        tournament_alias: { type: 'string' },
      },
      required: ['organization_alias', 'tournament_alias'],
    },
    handler: async (args) => {
      const organizationAlias = stringArgument(args, 'organization_alias');
      const tournamentAlias = stringArgument(args, 'tournament_alias');
      const tournament = await apiGet(
        config,
        `/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}`,
      );
      return JSON.stringify(tournament, null, 2);
    },
  };
}

function createTournamentTool(config: ApiClientConfig): McpToolDefinition {
  return {
    name: 'copalibre_create_tournament',
    description: 'Create a tournament in draft status.',
    inputSchema: {
      type: 'object',
      properties: {
        organization_alias: { type: 'string' },
        alias: { type: 'string' },
        name: { type: 'string' },
        descriptor_id: { type: 'string', description: 'DisciplineDescriptor identifier (UUID)' },
        descriptor_version: { type: 'string', description: 'Pinned descriptor semver' },
        format: { type: 'string' },
        public_registration: { type: 'boolean' },
        requires_check_in: { type: 'boolean' },
      },
      required: [
        'organization_alias',
        'alias',
        'name',
        'descriptor_id',
        'descriptor_version',
        'format',
        'public_registration',
        'requires_check_in',
      ],
    },
    handler: async (args) => {
      const organizationAlias = stringArgument(args, 'organization_alias');
      const tournament = await apiPost(
        config,
        `/organizations/${encodeURIComponent(organizationAlias)}/tournaments`,
        {
          alias: stringArgument(args, 'alias'),
          name: stringArgument(args, 'name'),
          descriptorId: stringArgument(args, 'descriptor_id'),
          descriptorVersion: stringArgument(args, 'descriptor_version'),
          format: stringArgument(args, 'format'),
          publicRegistration: Boolean(args.public_registration),
          requiresCheckIn: Boolean(args.requires_check_in),
        },
      );
      return JSON.stringify(tournament, null, 2);
    },
  };
}

function publishTournamentTool(config: ApiClientConfig): McpToolDefinition {
  return {
    name: 'copalibre_publish_tournament',
    description: 'Publish a draft tournament’s configuration.',
    inputSchema: {
      type: 'object',
      properties: {
        organization_alias: { type: 'string' },
        tournament_alias: { type: 'string' },
      },
      required: ['organization_alias', 'tournament_alias'],
    },
    handler: async (args) => {
      const organizationAlias = stringArgument(args, 'organization_alias');
      const tournamentAlias = stringArgument(args, 'tournament_alias');
      const tournament = await apiPost(
        config,
        `/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/publish`,
      );
      return JSON.stringify(tournament, null, 2);
    },
  };
}
