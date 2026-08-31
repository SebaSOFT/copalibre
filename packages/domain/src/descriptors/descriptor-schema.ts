import { Ajv, type ValidateFunction } from 'ajv';
import type { DisciplineDescriptorDocument } from './discipline-descriptor.js';
import { DescriptorValidationError } from '../errors.js';
import { err, ok, type Result } from '../result.js';
import { SUPPORTED_LANGUAGES } from '../i18n.js';
import { validateSeriesDeclaration } from '../aggregates/series.js';

/**
 * The wire schema of a submitted discipline module.
 *
 * A descriptor is operator-authored JSON that arrives over HTTP or out of a
 * module archive, so its shape is validated as data before anything types it.
 * Two members carry this phase's changes:
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
          // evaluation, which is the worst place to learn it. The schema
          // tightens rather than the loader normalising, because a normalised
          // document differs from the submitted one and module identity is a
          // signature-adjacent concern. An empty array is fine — it
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
 * A display string, in one language or several. A plain string is
 * still valid forever — every module authored before this schema is unaffected
 * — and an author who wants more than one language writes the object form
 * instead, requiring `en` as the guaranteed fallback every other localized
 * surface in the platform already falls back to.
 */
export const LOCALIZED_LABEL_SCHEMA: JsonSchemaDocument = {
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
    description: LOCALIZED_LABEL_SCHEMA,
    images: {
      type: 'array',
      minItems: 1,
      maxItems: 10,
      uniqueItems: true,
      items: {
        type: 'object',
        required: ['key'],
        additionalProperties: false,
        properties: {
          key: { type: 'string', minLength: 1 },
        },
      },
    },
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
          description: LOCALIZED_LABEL_SCHEMA,
          category: { enum: ['positive', 'negative', 'neutral'] },
          permittedSegmentTypes: { type: 'array', items: { type: 'string', minLength: 1 } },
          actorRequirement: { enum: ['none', 'side', 'person', 'person-or-staff'] },
          payloadSchema: { type: 'object' },
          effects: { type: 'array', items: { $ref: '#/definitions/eventEffect' } },
          personPayloadFields: { type: 'array', items: { type: 'string', minLength: 1 } },
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
          description: LOCALIZED_LABEL_SCHEMA,
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
          description: LOCALIZED_LABEL_SCHEMA,
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
    // The discipline's own explanation of a format it lists in
    // `availableFormats`; absent for a format falls back to the platform's
    // catalogued description. Never required — most disciplines mean exactly
    // what the platform already says.
    formatDescriptions: {
      type: 'object',
      additionalProperties: LOCALIZED_LABEL_SCHEMA,
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
    /**
     * Tag declarations. The structure is checked
     * here; whether a collector's `requiresTag` names one declared here is a
     * question about the whole document and lives in
     * `validateDisciplineDescriptorDocument`.
     */
    tags: { type: 'array', items: { $ref: '#/definitions/tagDeclaration' } },
    // Which roster roles exist, and their badge, is entirely the discipline's
    // to declare — never a core-hardcoded enum. Codes are unique for the same
    // reason a statistic code is: a `MatchRosterMember.roles` entry and a
    // `roster-role-snapshot` effect's `role` both resolve by exact match.
    rosterRoles: {
      type: 'array',
      uniqueItemProperties: ['code'],
      items: {
        type: 'object',
        required: ['code', 'label'],
        additionalProperties: false,
        properties: {
          code: { type: 'string', minLength: 1 },
          label: LOCALIZED_LABEL_SCHEMA,
          badge: { type: 'string', minLength: 1 },
        },
      },
    },
    // Standard tables/rankings this discipline declares — column sources are
    // checked here for shape; whether a `collector`/`composite` source names
    // a collector or statistic this discipline actually declares is a
    // whole-document question and lives in `validateDisciplineDescriptorDocument`.
    tableLayouts: { type: 'array', items: { $ref: '#/definitions/tableLayout' } },
    notificationRuleCapabilities: { type: 'array', items: { type: 'string', minLength: 1 } },
    winCondition: { $ref: RULE_SCRIPT_SCHEMA_ID },
    series: { $ref: '#/definitions/series' },
    uiMetadata: { type: 'object' },
    defaults: { type: 'object' },
    fieldPolicies: { type: 'object' },
  },
  definitions: {
    /**
     * A collector. The structure is checked here; whether it names an
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
                // Absent means 'primary' — resolvedActor's existing behavior.
                actorSource: {
                  oneOf: [
                    { enum: ['primary', 'every-other-side'] },
                    {
                      type: 'object',
                      additionalProperties: false,
                      required: ['payloadField'],
                      properties: { payloadField: { type: 'string', minLength: 1 } },
                    },
                  ],
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
        /** Absent reads as `{ kind: 'on-finalize' }`. */
        cadence: {
          type: 'object',
          additionalProperties: false,
          required: ['kind'],
          properties: {
            kind: { enum: ['on-finalize', 'live'] },
          },
        },
        /**
         * The tag an actor must carry, at fact time, for a fact to count.
         * Only meaningful on an event-/statistic-sourced collector —
         * `validateCollectors` refuses it on a participation-/collector-
         * sourced one, since neither has a fact-level instant to check.
         */
        requiresTag: {
          type: 'object',
          additionalProperties: false,
          required: ['code'],
          properties: {
            code: { type: 'string', minLength: 1 },
            competition: {
              enum: ['event', 'segment', 'match', 'stage', 'season', 'tournament', 'organization'],
            },
          },
        },
      },
    },
    /**
     * A standard table/ranking. Structure only — whether a
     * `collector`/`composite` source's code names something this discipline
     * declares is a whole-document question, in `validateDisciplineDescriptorDocument`.
     */
    tableLayout: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'target', 'label', 'entityGranularity', 'defaultSort', 'columns'],
      properties: {
        code: { type: 'string', minLength: 1 },
        target: {
          enum: [
            'group-phase',
            'match-roster',
            'player-ranking',
            'team-ranking',
            'schedule-timeframe',
          ],
        },
        label: LOCALIZED_LABEL_SCHEMA,
        entityGranularity: { enum: ['person', 'player', 'team', 'club', 'official', 'venue'] },
        filter: {
          type: 'object',
          additionalProperties: false,
          properties: {
            minSamples: {
              type: 'object',
              additionalProperties: false,
              required: ['collectorCode', 'min'],
              properties: {
                collectorCode: { type: 'string', minLength: 1 },
                min: { type: 'number' },
              },
            },
            requiresRole: { type: 'string', minLength: 1 },
            requiresTag: { type: 'string', minLength: 1 },
          },
        },
        defaultSort: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['columnCode', 'direction'],
            properties: {
              columnCode: { type: 'string', minLength: 1 },
              direction: { enum: ['asc', 'desc'] },
            },
          },
        },
        columns: {
          type: 'array',
          minItems: 1,
          uniqueItemProperties: ['code'],
          items: { $ref: '#/definitions/tableColumn' },
        },
      },
    },
    tableColumn: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'header', 'source', 'format'],
      properties: {
        code: { type: 'string', minLength: 1 },
        header: LOCALIZED_LABEL_SCHEMA,
        shortHeader: LOCALIZED_LABEL_SCHEMA,
        source: { $ref: '#/definitions/columnSource' },
        format: { enum: ['text', 'number', 'decimal-1', 'decimal-2', 'percentage', 'fraction'] },
        visibleByDefault: { type: 'boolean' },
      },
    },
    columnSource: {
      type: 'object',
      required: ['kind'],
      oneOf: [
        {
          additionalProperties: false,
          required: ['kind'],
          properties: { kind: { const: 'rank' } },
        },
        {
          additionalProperties: false,
          required: ['kind'],
          properties: { kind: { enum: ['entrant-name', 'actor-name', 'team-name', 'role'] } },
        },
        {
          additionalProperties: false,
          required: ['kind', 'code'],
          properties: { kind: { const: 'collector' }, code: { type: 'string', minLength: 1 } },
        },
        {
          additionalProperties: false,
          required: ['kind', 'numerator', 'denominator'],
          properties: {
            kind: { const: 'composite' },
            numerator: { type: 'string', minLength: 1 },
            denominator: { type: 'string', minLength: 1 },
          },
        },
        {
          additionalProperties: false,
          required: ['kind', 'expression'],
          properties: {
            kind: { const: 'computed' },
            expression: { type: 'string', minLength: 1 },
          },
        },
        {
          additionalProperties: false,
          required: ['kind', 'template'],
          properties: { kind: { const: 'template' }, template: { type: 'string', minLength: 1 } },
        },
      ],
    },
    /**
     * A tag declaration. `label` is a plain string
     * (unlike a collector's `LOCALIZED_LABEL_SCHEMA` label) — matching
     * `TagDeclaration`'s own domain type exactly.
     */
    tagDeclaration: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'label', 'appliesTo'],
      properties: {
        code: { type: 'string', minLength: 1 },
        label: { type: 'string', minLength: 1 },
        appliesTo: {
          type: 'array',
          minItems: 1,
          items: { enum: ['person', 'player', 'team', 'club', 'official', 'venue'] },
        },
        scopedTo: {
          type: 'array',
          items: {
            enum: ['event', 'segment', 'match', 'stage', 'season', 'tournament', 'organization'],
          },
        },
        producedAt: {
          enum: ['event', 'segment', 'match', 'stage', 'season', 'tournament', 'organization'],
        },
        exclusive: { type: 'boolean' },
        until: {
          type: 'object',
          required: ['kind'],
          oneOf: [
            {
              additionalProperties: false,
              required: ['kind'],
              properties: { kind: { const: 'lifted' } },
            },
            {
              additionalProperties: false,
              required: ['kind'],
              properties: { kind: { const: 'granularity-ends' } },
            },
            {
              additionalProperties: false,
              required: ['kind', 'collectorCode', 'value'],
              properties: {
                kind: { const: 'collector-reaches' },
                collectorCode: { type: 'string', minLength: 1 },
                value: { type: 'number' },
              },
            },
          ],
        },
      },
    },
    /**
     * An effect was once `{ type: 'object' }` — anything at all installed,
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
            // Absent means 'actor' — exactly the behavior before this field existed.
            awardTo: {
              oneOf: [
                { enum: ['actor', 'every-other-side'] },
                {
                  type: 'object',
                  additionalProperties: false,
                  required: ['payloadField'],
                  properties: { payloadField: { type: 'string', minLength: 1 } },
                },
              ],
            },
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
            // No 'every-other-side': a tag labels one actor, not a side's whole
            // roster. Absent means 'actor'.
            target: {
              oneOf: [
                { const: 'actor' },
                {
                  type: 'object',
                  additionalProperties: false,
                  required: ['payloadField'],
                  properties: { payloadField: { type: 'string', minLength: 1 } },
                },
              ],
            },
          },
        },
        {
          additionalProperties: false,
          required: ['kind', 'payloadField', 'role', 'side'],
          properties: {
            kind: { const: 'roster-role-snapshot' },
            payloadField: { type: 'string', minLength: 1 },
            role: { type: 'string', minLength: 1 },
            side: { enum: ['actor', 'every-other-side'] },
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
              description: LOCALIZED_LABEL_SCHEMA,
            },
          },
        },
      },
    },
    series: {
      type: 'object',
      required: ['span'],
      properties: {
        span: { type: 'integer', minimum: 2 },
        resolutionClass: { enum: ['best-of', 'aggregate', 'points-per-leg'] },
        resolutionScript: { $ref: RULE_SCRIPT_SCHEMA_ID },
        neutralGround: { type: 'boolean' },
        standingsAccounting: { enum: ['series', 'match'] },
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
  const duplicateRosterRole = firstDuplicate(
    (descriptor.rosterRoles ?? []).map((role) => role.code),
  );
  if (duplicateRosterRole) {
    return err(
      new DescriptorValidationError(
        `Discipline descriptor declares roster role "${duplicateRosterRole}" more than once`,
        { field: 'rosterRoles', code: duplicateRosterRole },
      ),
    );
  }
  for (const table of descriptor.tableLayouts ?? []) {
    const duplicateColumn = firstDuplicate(table.columns.map((column) => column.code));
    if (duplicateColumn) {
      return err(
        new DescriptorValidationError(
          `Table "${table.code}" declares column "${duplicateColumn}" more than once`,
          { field: 'tableLayouts', table: table.code, code: duplicateColumn },
        ),
      );
    }
  }

  const rawDoc = document as Record<string, unknown>;
  const seriesDeclarations = [
    rawDoc.series,
    (rawDoc.defaults as Record<string, unknown> | undefined)?.series,
  ].filter((s) => s !== undefined);

  for (const s of seriesDeclarations) {
    const valid = validateSeriesDeclaration(s);
    if (!valid.ok) {
      return err(
        new DescriptorValidationError(
          `Discipline descriptor series declaration is invalid: ${valid.error.message}`,
          {
            field: valid.error.details?.field ?? 'series',
            ...valid.error.details,
          },
        ),
      );
    }
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
