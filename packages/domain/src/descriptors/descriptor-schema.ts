import { Ajv, type ValidateFunction } from 'ajv';
import type { DisciplineDescriptorDocument } from './discipline-descriptor.js';
import { DescriptorValidationError } from '../errors.js';
import { err, ok, type Result } from '../result.js';
import { SUPPORTED_LANGUAGES } from '../i18n.js';

/**
 * The wire schema of a submitted discipline module.
 *
 * A descriptor is operator-authored JSON that arrives over HTTP or out of a
 * module archive, so its shape is validated as data before anything types it.
 * Two members carry this phase's changes (0009-discipline-driven-results):
 *
 * - `winCondition` is a rule script — a serializable Neuron-JS document — not
 *   an enumerated string, so "first to 2 sets, a set being first to 6 games by
 *   a 2-game margin" is expressible at all;
 * - `statistics[]` is the vocabulary accounting folds over, so a descriptor
 *   that declares nothing declares a discipline with no standings.
 *
 * Reference vetting (does every action the script names exist in the core
 * registry?) is `@copalibre/rules`' job: this layer proves the document is
 * well-formed, that one proves it is permitted. Structure first, meaning after.
 */

/** JSON Schema (draft-07 vocabulary — Ajv 8's default meta-schema). */
export type JsonSchemaDocument = Readonly<Record<string, unknown>>;

/**
 * A Neuron-JS script as data. Mirrors the engine's own
 * `schemas/script.schema.json`, restated here because `@copalibre/domain`
 * stays framework-free: the domain describes what a valid submission looks
 * like without importing the engine that will run it.
 */
export const RULE_SCRIPT_SCHEMA_ID = 'https://copalibre.org/schemas/rule-script.json';

export const RULE_SCRIPT_SCHEMA: JsonSchemaDocument = Object.freeze({
  $id: RULE_SCRIPT_SCHEMA_ID,
  type: 'object',
  required: ['id', 'rules'],
  properties: {
    id: { type: 'string', minLength: 1 },
    rules: { type: 'array', items: { $ref: '#/definitions/rule' } },
  },
  definitions: {
    element: {
      type: 'object',
      required: ['id', 'type'],
      properties: {
        id: { type: 'string', minLength: 1 },
        type: { type: 'string', minLength: 1 },
        options: { type: 'object' },
      },
    },
    parameter: {
      allOf: [
        { $ref: '#/definitions/element' },
        {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string', minLength: 1 } },
        },
      ],
    },
    paramsOwner: {
      allOf: [
        { $ref: '#/definitions/element' },
        {
          type: 'object',
          properties: {
            params: { type: 'array', items: { $ref: '#/definitions/parameter' } },
          },
        },
      ],
    },
    rule: {
      allOf: [
        { $ref: '#/definitions/element' },
        {
          type: 'object',
          // Both arrays are required because Neuron's `validateScript` demands
          // them: a rule omitting one passed installation and failed at
          // evaluation, which is the worst place to learn it (0013). The schema
          // tightens rather than the loader normalising, because a normalised
          // document differs from the submitted one and module identity is a
          // signature-adjacent concern in 0034. An empty array is fine — it
          // means "no conditions", which is a rule that always fires.
          required: ['conditions', 'actions'],
          properties: {
            conditions: { type: 'array', items: { $ref: '#/definitions/paramsOwner' } },
            actions: { type: 'array', items: { $ref: '#/definitions/paramsOwner' } },
          },
        },
      ],
    },
  },
});

/**
 * The recorded result, as submitted. Deliberately permits any number of sides
 * — an eight-lane heat is the same document shape as a duel — and carries the
 * statistic values keyed by code. Which codes are legal is descriptor-dependent
 * and therefore checked in `validateRecordedOutcome`, not here.
 */
export const RECORDED_OUTCOME_SCHEMA: JsonSchemaDocument = Object.freeze({
  type: 'object',
  required: ['matchId', 'sides'],
  additionalProperties: false,
  properties: {
    matchId: { type: 'string', minLength: 1 },
    winnerEntrantId: { type: 'string', minLength: 1 },
    sides: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['entrantId', 'statistics'],
        additionalProperties: false,
        properties: {
          entrantId: { type: 'string', minLength: 1 },
          statistics: {
            type: 'object',
            additionalProperties: { type: 'number' },
          },
          placement: { type: 'integer', minimum: 1 },
          resultReason: {
            type: 'string',
            enum: [
              'played',
              'administrative-loss',
              'walkover',
              'forfeit-abandonment',
              'disqualified',
              'did-not-finish',
            ],
          },
        },
      },
    },
  },
});

const AGGREGATION_MODES = ['sum', 'count', 'max', 'min', 'average'] as const;

/**
 * A display string, in one language or several (0071). A plain string is
 * still valid forever — every module authored before this schema is unaffected
 * — and an author who wants more than one language writes the object form
 * instead, requiring `en` as the guaranteed fallback every other localized
 * surface in the platform already falls back to.
 */
const LOCALIZED_LABEL_SCHEMA: JsonSchemaDocument = {
  oneOf: [
    { type: 'string', minLength: 1 },
    {
      type: 'object',
      required: ['en'],
      additionalProperties: false,
      properties: Object.fromEntries(
        SUPPORTED_LANGUAGES.map((language) => [language, { type: 'string', minLength: 1 }]),
      ),
    },
  ],
};

export const DISCIPLINE_DESCRIPTOR_SCHEMA: JsonSchemaDocument = Object.freeze({
  type: 'object',
  required: [
    'alias',
    'version',
    'name',
    'attribution',
    'participantTypes',
    'rosterConstraints',
    'segmentTypes',
    'eventDefinitions',
    'statistics',
    'scoringInputs',
    'availableFormats',
    'notificationRuleCapabilities',
    'winCondition',
    'defaults',
    'fieldPolicies',
  ],
  properties: {
    alias: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 64 },
    version: { type: 'string', minLength: 1 },
    name: LOCALIZED_LABEL_SCHEMA,
    attribution: {
      type: 'object',
      required: ['author', 'licence'],
      properties: {
        author: { type: 'string', minLength: 1 },
        licence: { type: 'string', minLength: 1 },
        sourceUrl: { type: 'string' },
      },
    },
    participantTypes: {
      type: 'array',
      minItems: 1,
      items: { enum: ['individual', 'team'] },
    },
    rosterConstraints: {
      type: 'object',
      required: ['minPlayers', 'maxPlayers'],
      properties: {
        minPlayers: { type: 'integer', minimum: 1 },
        maxPlayers: { type: 'integer', minimum: 1 },
        maxSubstitutes: { type: 'integer', minimum: 0 },
        allowMidTournamentChanges: { type: 'boolean' },
      },
    },
    segmentTypes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'label', 'timed'],
        properties: {
          name: { type: 'string', minLength: 1 },
          label: LOCALIZED_LABEL_SCHEMA,
          timed: { type: 'boolean' },
          defaultDurationSeconds: { type: 'integer', minimum: 0 },
        },
      },
    },
    eventDefinitions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['code', 'label', 'category', 'permittedSegmentTypes', 'actorRequirement'],
        properties: {
          code: { type: 'string', minLength: 1 },
          label: LOCALIZED_LABEL_SCHEMA,
          category: { enum: ['positive', 'negative', 'neutral'] },
          permittedSegmentTypes: { type: 'array', items: { type: 'string', minLength: 1 } },
          actorRequirement: { enum: ['none', 'side', 'person', 'person-or-staff'] },
          payloadSchema: { type: 'object' },
          effects: { type: 'array', items: { $ref: '#/definitions/eventEffect' } },
          workflow: { $ref: '#/definitions/eventWorkflow' },
        },
      },
    },
    // The accounting vocabulary. Codes are unique because standings key on
    // them: two definitions of `points` would make the fold order decide the
    // table, which is exactly the silent-wrong-ranking class this phase closes.
    statistics: {
      type: 'array',
      uniqueItemProperties: ['code'],
      items: {
        type: 'object',
        required: ['code', 'label', 'aggregation'],
        additionalProperties: false,
        properties: {
          code: { type: 'string', minLength: 1 },
          label: LOCALIZED_LABEL_SCHEMA,
          aggregation: { enum: [...AGGREGATION_MODES] },
        },
      },
    },
    scoringInputs: {
      type: 'array',
      items: {
        type: 'object',
        required: ['code', 'label', 'source'],
        additionalProperties: false,
        properties: {
          code: { type: 'string', minLength: 1 },
          label: LOCALIZED_LABEL_SCHEMA,
          source: { enum: ['event-derived', 'operator-entered'] },
        },
      },
    },
    availableFormats: {
      type: 'array',
      items: {
        enum: [
          'single-elimination',
          'double-elimination',
          'round-robin',
          'league',
          'round-robin-single-leg',
          'round-robin-home-away',
          'free-for-all',
          'heats',
        ],
      },
    },
    // Structural, not discipline-specific: every placement discipline needs a
    // position-to-points mapping and none of them expresses it differently.
    placementScoring: {
      type: 'object',
      required: ['statisticCode', 'table'],
      additionalProperties: false,
      properties: {
        statisticCode: { type: 'string', minLength: 1 },
        beyondTable: { type: 'number' },
        table: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['placement', 'points'],
            additionalProperties: false,
            properties: {
              placement: { type: 'integer', minimum: 1 },
              points: { type: 'number' },
            },
          },
        },
      },
    },
    collectors: { type: 'array', items: { $ref: '#/definitions/collector' } },
    notificationRuleCapabilities: { type: 'array', items: { type: 'string', minLength: 1 } },
    winCondition: { $ref: RULE_SCRIPT_SCHEMA_ID },
    uiMetadata: { type: 'object' },
    defaults: { type: 'object' },
    fieldPolicies: { type: 'object' },
  },
  definitions: {
    /**
     * A collector (0016). The structure is checked here; whether it names an
     * event this discipline defines, or a collector it declares, is a question
     * about the whole document and lives in `validateCollectors`.
     */
    collector: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'label', 'source', 'measure', 'granularity'],
      properties: {
        code: { type: 'string', minLength: 1 },
        label: LOCALIZED_LABEL_SCHEMA,
        source: {
          type: 'object',
          required: ['kind'],
          oneOf: [
            {
              additionalProperties: false,
              required: ['kind'],
              properties: {
                kind: { const: 'event' },
                definitionCodes: { type: 'array', items: { type: 'string', minLength: 1 } },
                categories: {
                  type: 'array',
                  items: { enum: ['positive', 'negative', 'neutral'] },
                },
              },
            },
            {
              additionalProperties: false,
              required: ['kind', 'statisticCode'],
              properties: {
                kind: { const: 'statistic' },
                statisticCode: { type: 'string', minLength: 1 },
              },
            },
            {
              additionalProperties: false,
              required: ['kind', 'code'],
              properties: { kind: { const: 'collector' }, code: { type: 'string', minLength: 1 } },
            },
            {
              additionalProperties: false,
              required: ['kind'],
              properties: {
                kind: { const: 'participation' },
                roles: { type: 'array', items: { type: 'string', minLength: 1 } },
              },
            },
          ],
        },
        measure: {
          type: 'object',
          required: ['kind'],
          oneOf: [
            {
              additionalProperties: false,
              required: ['kind'],
              properties: { kind: { const: 'count' } },
            },
            {
              additionalProperties: false,
              required: ['kind', 'field'],
              properties: {
                kind: { enum: ['sum', 'max', 'min', 'average'] },
                field: { type: 'string', minLength: 1 },
              },
            },
          ],
        },
        granularity: {
          type: 'object',
          additionalProperties: false,
          required: ['actor', 'competition'],
          properties: {
            actor: { enum: ['person', 'player', 'team', 'club', 'official', 'venue'] },
            competition: {
              enum: ['event', 'segment', 'match', 'stage', 'season', 'tournament', 'organization'],
            },
          },
        },
        rollsUpTo: {
          type: 'object',
          additionalProperties: false,
          properties: {
            actor: { enum: ['person', 'player', 'team', 'club', 'official', 'venue'] },
            competition: {
              enum: ['event', 'segment', 'match', 'stage', 'season', 'tournament', 'organization'],
            },
          },
        },
        /** Absent reads as `{ kind: 'on-finalize' }` (0082). */
        cadence: {
          type: 'object',
          additionalProperties: false,
          required: ['kind'],
          properties: {
            kind: { enum: ['on-finalize', 'live'] },
          },
        },
      },
    },
    /**
     * An effect was `{ type: 'object' }` until 0014 — anything at all installed,
     * and the TypeScript union describing it was a claim the gate never
     * checked. A module could ship `{ kind: 'score', side: 'opponent' }`, pass
     * installation, and mean nothing at match time. Each kind now states its
     * own members and refuses the rest.
     */
    eventEffect: {
      type: 'object',
      required: ['kind'],
      oneOf: [
        {
          additionalProperties: false,
          required: ['kind', 'awardTo', 'delta'],
          properties: {
            kind: { const: 'score' },
            // "the opponent" is undefined in a heat; "every other side" is what
            // the duel case always meant.
            awardTo: { enum: ['actor', 'every-other-side'] },
            delta: { type: 'number' },
          },
        },
        {
          additionalProperties: false,
          required: ['kind', 'statisticCode', 'delta'],
          properties: {
            kind: { const: 'statistic' },
            statisticCode: { type: 'string', minLength: 1 },
            delta: { type: 'number' },
          },
        },
        {
          additionalProperties: false,
          required: ['kind', 'durationSeconds', 'affects'],
          properties: {
            kind: { const: 'timed-penalty' },
            durationSeconds: { type: 'number', exclusiveMinimum: 0 },
            /** The person who caused it, or the entrant they belong to. */
            affects: { enum: ['actor', 'side'] },
            allowManualResolution: { type: 'boolean' },
          },
        },
        {
          additionalProperties: false,
          required: ['kind', 'transition'],
          properties: {
            kind: { const: 'match-state' },
            transition: { type: 'string', minLength: 1 },
          },
        },
        {
          additionalProperties: false,
          required: ['kind', 'tagCode', 'action'],
          properties: {
            kind: { const: 'tag' },
            tagCode: { type: 'string', minLength: 1 },
            action: { enum: ['applied', 'lifted'] },
          },
        },
      ],
    },
    eventWorkflow: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'options'],
      properties: {
        kind: { const: 'outcome-choice' },
        options: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['definitionCode', 'label'],
            properties: {
              definitionCode: { type: 'string', minLength: 1 },
              label: LOCALIZED_LABEL_SCHEMA,
            },
          },
        },
      },
    },
  },
});

/** Shared validator for all versioned module document schemas. */
export const moduleDocumentAjv = new Ajv({ allErrors: false, coerceTypes: false, strict: false });
moduleDocumentAjv.addSchema(RULE_SCRIPT_SCHEMA);
let descriptorValidator: ValidateFunction | undefined;

/**
 * Validates a submitted descriptor document structurally, before it is trusted
 * as a `DisciplineDescriptor`. Statistic codes must be unique — enforced here
 * rather than in the schema, which has no portable "unique by property" keyword.
 */
export function validateDisciplineDescriptorDocument(
  document: unknown,
): Result<DisciplineDescriptorDocument, DescriptorValidationError> {
  descriptorValidator ??= moduleDocumentAjv.compile(
    stripCustomKeywords(DISCIPLINE_DESCRIPTOR_SCHEMA),
  );

  if (!descriptorValidator(document)) {
    const [first] = descriptorValidator.errors ?? [];
    return err(
      new DescriptorValidationError(
        `Discipline descriptor does not satisfy its schema: ${describe(first)}`,
        { field: fieldOf(first), errors: descriptorValidator.errors ?? undefined },
      ),
    );
  }

  const descriptor = document as DisciplineDescriptorDocument;
  const definitionCodes = new Set(descriptor.eventDefinitions.map((definition) => definition.code));
  for (const definition of descriptor.eventDefinitions) {
    const unknown = definition.workflow?.options.find(
      (option) => !definitionCodes.has(option.definitionCode),
    );
    if (unknown) {
      return err(
        new DescriptorValidationError(
          `Event "${definition.code}" workflow names unknown event "${unknown.definitionCode}"`,
          {
            field: 'eventDefinitions',
            definitionCode: definition.code,
            option: unknown.definitionCode,
          },
        ),
      );
    }
  }
  const duplicate = firstDuplicate(descriptor.statistics.map((statistic) => statistic.code));
  if (duplicate) {
    return err(
      new DescriptorValidationError(
        `Discipline descriptor declares statistic "${duplicate}" more than once`,
        { field: 'statistics', code: duplicate },
      ),
    );
  }
  return ok(descriptor);
}

/** Ajv error → the dotted path an authoring UI can highlight. */
export function fieldOf(error?: {
  instancePath: string;
  params: Record<string, unknown>;
}): string | undefined {
  if (!error) return undefined;
  const path = error.instancePath.replace(/^\//, '').replaceAll('/', '.');
  const missing = error.params.missingProperty;
  const additional = error.params.additionalProperty;
  return (
    path ||
    (typeof missing === 'string' ? missing : undefined) ||
    (typeof additional === 'string' ? additional : undefined)
  );
}

export function describe(error?: {
  instancePath: string;
  message?: string;
  params?: Record<string, unknown>;
}): string {
  if (!error) return 'validation failed';
  // Ajv keeps the offending member in `params`, not in the message; an author
  // fixing a rejected module needs the name, not just "additional properties".
  const offender = error.params?.additionalProperty ?? error.params?.missingProperty;
  const named = typeof offender === 'string' ? ` ("${offender}")` : '';
  return error.instancePath
    ? `${error.instancePath} ${error.message ?? 'is invalid'}${named}`
    : `${error.message ?? 'validation failed'}${named}`;
}

function firstDuplicate(values: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

/**
 * `uniqueItemProperties` documents intent in the published schema (it is an
 * ajv-keywords keyword), but the compiled validator must not depend on a
 * plugin, so it is dropped before compilation and checked in code.
 */
function stripCustomKeywords(schema: JsonSchemaDocument): JsonSchemaDocument {
  const properties = { ...(schema.properties as Record<string, JsonSchemaDocument>) };
  const statistics: Record<string, unknown> = { ...properties.statistics };
  delete statistics.uniqueItemProperties;
  return { ...schema, properties: { ...properties, statistics } };
}
