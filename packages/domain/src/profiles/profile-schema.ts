import type { ValidateFunction } from 'ajv';
import { TournamentProfileValidationError } from '../errors.js';
import { err, ok, type Result } from '../result.js';
import {
  describe,
  fieldOf,
  LOCALIZED_LABEL_SCHEMA,
  moduleDocumentAjv,
  RULE_SCRIPT_SCHEMA_ID,
  type JsonSchemaDocument,
} from '../descriptors/descriptor-schema.js';
import type { TournamentProfileDocument } from './tournament-profile.js';

const TOURNAMENT_FORMATS = [
  'single-elimination',
  'double-elimination',
  'round-robin',
  'league',
  'round-robin-single-leg',
  'round-robin-home-away',
  'free-for-all',
  'heats',
] as const;

/** Draft-07 wire schema for a publishable tournament-profile document. */
export const TOURNAMENT_PROFILE_SCHEMA: JsonSchemaDocument = Object.freeze({
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['alias', 'version', 'name', 'attribution', 'requires', 'stages', 'points', 'tiebreak'],
  properties: {
    alias: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 64 },
    version: { type: 'string', minLength: 1 },
    name: LOCALIZED_LABEL_SCHEMA,
    description: LOCALIZED_LABEL_SCHEMA,
    attribution: {
      type: 'object',
      required: ['author', 'licence'],
      properties: {
        author: { type: 'string', minLength: 1 },
        licence: { type: 'string', minLength: 1 },
        sourceUrl: { type: 'string' },
      },
    },
    requires: {
      type: 'array',
      items: {
        type: 'object',
        required: ['capability', 'satisfiedBy', 'necessity'],
        additionalProperties: false,
        properties: {
          capability: { type: 'string', minLength: 1 },
          satisfiedBy: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', minLength: 1 },
          },
          necessity: { enum: ['required', 'optional'] },
          description: { type: 'string' },
        },
      },
    },
    stages: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['number', 'name', 'format'],
        additionalProperties: false,
        properties: {
          number: { type: 'integer', minimum: 1 },
          name: { type: 'string', minLength: 1 },
          format: { enum: TOURNAMENT_FORMATS },
          overrides: { type: 'object' },
        },
      },
    },
    points: {
      type: 'object',
      required: ['win', 'draw', 'loss'],
      additionalProperties: false,
      properties: {
        win: { type: 'number' },
        draw: { type: 'number' },
        loss: { type: 'number' },
      },
    },
    tiebreak: {
      type: 'array',
      items: {
        type: 'object',
        required: ['capability', 'label', 'direction', 'missingValue'],
        additionalProperties: false,
        properties: {
          capability: { type: 'string', minLength: 1 },
          label: { type: 'string', minLength: 1 },
          direction: { enum: ['higher_wins', 'lower_wins'] },
          missingValue: { enum: ['treat-as-worst', 'treat-as-zero', 'invalid'] },
          scope: { enum: ['overall', 'head-to-head', 'match-losses'] },
        },
      },
    },
    winConditionOverride: { $ref: RULE_SCRIPT_SCHEMA_ID },
  },
});

let tournamentProfileValidator: ValidateFunction | undefined;

/** Validates a profile document before it is installed or treated as a profile. */
export function validateTournamentProfileDocument(
  document: unknown,
): Result<TournamentProfileDocument, TournamentProfileValidationError> {
  tournamentProfileValidator ??= moduleDocumentAjv.compile(TOURNAMENT_PROFILE_SCHEMA);

  if (!tournamentProfileValidator(document)) {
    const [first] = tournamentProfileValidator.errors ?? [];
    return err(
      new TournamentProfileValidationError(
        `Tournament profile does not satisfy its schema: ${describe(first)}`,
        { field: fieldOf(first), errors: tournamentProfileValidator.errors ?? undefined },
      ),
    );
  }

  return ok(document as TournamentProfileDocument);
}
