import { Ajv, type ValidateFunction } from 'ajv';
import type { DisciplineDescriptor } from '../descriptors/discipline-descriptor.js';
import {
  RECORDED_OUTCOME_SCHEMA,
  describe,
  fieldOf,
  type JsonSchemaDocument,
} from '../descriptors/descriptor-schema.js';
import { OutcomeValidationError } from '../errors.js';
import { err, ok, type Result } from '../result.js';
import type { RecordedOutcome } from './outcome.js';

/**
 * A recorded outcome is only meaningful against the discipline it was recorded
 * under: `frags` is a real statistic in a shooter and a typo in football. The
 * structural schema accepts any numeric statistic map; this validator closes
 * it to exactly the codes the bound descriptor declares, so a mistyped code is
 * refused at the door instead of being stored and silently ignored by
 * accounting — the failure mode 0009 exists to remove.
 */

export interface OutcomeValidationOptions {
  /**
   * Placement matches must number every side; duels must not. The caller knows
   * the match shape, so it states it rather than the validator guessing from
   * side count (a two-lane heat is still a heat).
   */
  readonly shape?: 'duel' | 'placement';
}

const ajv = new Ajv({ allErrors: false, coerceTypes: false, strict: false });
const structural: ValidateFunction = ajv.compile(RECORDED_OUTCOME_SCHEMA);
const byDescriptor = new Map<string, ValidateFunction>();

export function validateRecordedOutcome(
  descriptor: DisciplineDescriptor,
  outcome: unknown,
  options: OutcomeValidationOptions = {},
): Result<RecordedOutcome, OutcomeValidationError> {
  if (!structural(outcome)) {
    const [first] = structural.errors ?? [];
    return err(
      new OutcomeValidationError(
        `Recorded outcome does not satisfy its schema: ${describe(first)}`,
        {
          field: fieldOf(first),
          errors: structural.errors ?? undefined,
        },
      ),
    );
  }

  const candidate = outcome as RecordedOutcome;
  const declaredCheck = declaredStatisticsValidator(descriptor);

  for (const side of candidate.sides) {
    if (!declaredCheck(side.statistics)) {
      const [first] = declaredCheck.errors ?? [];
      const unknownCode = first?.params.additionalProperty;
      return err(
        new OutcomeValidationError(
          `Statistic "${String(unknownCode)}" is not declared by discipline "${descriptor.name}"`,
          {
            descriptorId: descriptor.descriptorId,
            entrantId: side.entrantId,
            code: typeof unknownCode === 'string' ? unknownCode : undefined,
          },
        ),
      );
    }
  }

  const entrantIds = candidate.sides.map((side) => side.entrantId);
  const duplicate = entrantIds.find((id, index) => entrantIds.indexOf(id) !== index);
  if (duplicate) {
    return err(
      new OutcomeValidationError(`Entrant "${duplicate}" appears on more than one side`, {
        matchId: candidate.matchId,
        entrantId: duplicate,
      }),
    );
  }

  if (candidate.winnerEntrantId !== undefined && !entrantIds.includes(candidate.winnerEntrantId)) {
    return err(
      new OutcomeValidationError(
        `Winner "${candidate.winnerEntrantId}" is not one of the recorded sides`,
        { matchId: candidate.matchId, entrantId: candidate.winnerEntrantId },
      ),
    );
  }

  if (options.shape === 'placement') {
    const unplaced = candidate.sides.find((side) => side.placement === undefined);
    if (unplaced) {
      return err(
        new OutcomeValidationError(
          `Placement outcome leaves entrant "${unplaced.entrantId}" without a placement`,
          { matchId: candidate.matchId, entrantId: unplaced.entrantId },
        ),
      );
    }
  }

  return ok(candidate);
}

/**
 * One compiled validator per descriptor version, keyed the way the module
 * registry versions modules: two versions of a discipline are two vocabularies.
 */
function declaredStatisticsValidator(descriptor: DisciplineDescriptor): ValidateFunction {
  const key = `${descriptor.descriptorId}@${descriptor.version}`;
  let validate = byDescriptor.get(key);
  if (!validate) {
    validate = ajv.compile(declaredStatisticsSchema(descriptor));
    byDescriptor.set(key, validate);
  }
  return validate;
}

/** The descriptor's declared statistics, as a closed object schema. */
export function declaredStatisticsSchema(descriptor: DisciplineDescriptor): JsonSchemaDocument {
  return {
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(
      descriptor.statistics.map((statistic) => [statistic.code, { type: 'number' }]),
    ),
  };
}
