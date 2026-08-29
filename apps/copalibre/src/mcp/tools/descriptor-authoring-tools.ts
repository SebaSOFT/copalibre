import {
  DESCRIPTOR_FIELD_EXPLANATIONS,
  DISCIPLINE_DESCRIPTOR_SCHEMA,
  validateDisciplineDescriptorDocument,
} from '@copalibre/domain';
import type { McpToolDefinition } from '../tool.js';

/**
 * The two descriptor-authoring tools: retrieve the schema an agent must
 * target, and validate a candidate against the exact same validator the
 * installation path applies. Always available — no API token, no HTTP
 * surface, since both operate purely in memory against a module already
 * imported into this process (openspec 0163).
 */
export function descriptorAuthoringTools(): readonly McpToolDefinition[] {
  return [descriptorSchemaTool(), descriptorValidateTool()];
}

function descriptorSchemaTool(): McpToolDefinition {
  return {
    name: 'copalibre_descriptor_schema',
    description:
      "Returns the discipline descriptor's machine-readable JSON Schema — byte-identical to what " +
      'copalibre_descriptor_validate and installation both check against — together with a ' +
      'field-by-field explanation of what each declaration governs during a competition, not just ' +
      'its shape. Use this first when authoring a new discipline module, before writing any JSON. ' +
      'Needs no API token.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () =>
      JSON.stringify(
        { schema: DISCIPLINE_DESCRIPTOR_SCHEMA, fieldExplanations: DESCRIPTOR_FIELD_EXPLANATIONS },
        null,
        2,
      ),
  };
}

function descriptorValidateTool(): McpToolDefinition {
  return {
    name: 'copalibre_descriptor_validate',
    description:
      'Validates a candidate discipline descriptor document by calling the same validator the ' +
      'installation path applies — shape and cross-field checks alike (a best-of series span must ' +
      'be odd; a resolution class and a resolution script are mutually exclusive; and more). A ' +
      'descriptor this tool accepts is exactly one installation will accept; it never authors a ' +
      'descriptor, only judges one already drafted. Use it after copalibre_descriptor_schema, ' +
      'iteratively, before copalibre_module_scaffold/_validate_local. Needs no API token.',
    inputSchema: {
      type: 'object',
      properties: { descriptor: { type: 'object' } },
      required: ['descriptor'],
    },
    handler: async (args) => {
      const descriptor = args.descriptor;
      if (typeof descriptor !== 'object' || descriptor === null) {
        throw new Error('descriptor must be a JSON object');
      }
      const result = validateDisciplineDescriptorDocument(descriptor);
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
