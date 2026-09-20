import {
  PROFILE_FIELD_EXPLANATIONS,
  TOURNAMENT_PROFILE_SCHEMA,
  validateTournamentProfileDocument,
} from '@copalibre/domain';
import type { McpToolDefinition } from '../tool.js';

/**
 * The two profile-authoring tools: retrieve the schema an agent must
 * target, and validate a candidate against the exact same validator the
 * installation path applies. Always available — no API token, no HTTP
 * surface, since both operate purely in memory against a module already
 * imported into this process (mirrors descriptor-authoring-tools.ts for the
 * other module kind).
 */
export function profileAuthoringTools(): readonly McpToolDefinition[] {
  return [profileSchemaTool(), profileValidateTool()];
}

function profileSchemaTool(): McpToolDefinition {
  return {
    name: 'copalibre_profile_schema',
    description:
      "Returns the tournament profile's machine-readable JSON Schema — byte-identical to what " +
      'copalibre_profile_validate and installation both check against — together with a ' +
      'field-by-field explanation of what each declaration governs during a competition, not ' +
      'just its shape. Use this first when authoring a new tournament-profile module, before ' +
      'writing any JSON. Needs no API token.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () =>
      JSON.stringify(
        { schema: TOURNAMENT_PROFILE_SCHEMA, fieldExplanations: PROFILE_FIELD_EXPLANATIONS },
        null,
        2,
      ),
  };
}

function profileValidateTool(): McpToolDefinition {
  return {
    name: 'copalibre_profile_validate',
    description:
      'Validates a candidate tournament-profile document by calling the same validator the ' +
      'installation path applies. A profile this tool accepts is exactly one installation will ' +
      'accept; it never authors a profile, only judges one already drafted. Use it after ' +
      'copalibre_profile_schema, iteratively, before copalibre_module_scaffold/_validate_local. ' +
      'Needs no API token.',
    inputSchema: {
      type: 'object',
      properties: { profile: { type: 'object' } },
      required: ['profile'],
    },
    handler: async (args) => {
      const profile = args.profile;
      if (typeof profile !== 'object' || profile === null) {
        throw new Error('profile must be a JSON object');
      }
      const result = validateTournamentProfileDocument(profile);
      if (result.ok) {
        return JSON.stringify({ ok: true }, null, 2);
      }
      return JSON.stringify(
        {
          ok: false,
          error: result.error.message,
          field: result.error.details?.field,
        },
        null,
        2,
      );
    },
  };
}
