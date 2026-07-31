import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';
import type { Entrant } from './participant.js';

/**
 * Operator knowledge the results cannot supply.
 *
 * A ranking, a region, an association: none of it is derivable from what
 * happened on the field, and all of it decides how a draw should come out.
 * Attributes are the seam where that knowledge enters
 * (0010-stage-qualification-and-seeding).
 *
 * They are scoped to the entrant *within one tournament*, deliberately. An
 * organization-wide ranking table is the obvious instinct and the wrong one: it
 * goes stale between tournaments, needs its own update authority and history,
 * and forces a decision about what a ranking means across disciplines. The flow
 * that exists in the field is an operator typing the number while loading the
 * teams, for this tournament. A persistent ranking can pre-fill these later
 * without allocation logic knowing the difference.
 */

export interface EntrantAttribute {
  /** Operator-chosen key: `ranking`, `region`, `association`. Never interpreted. */
  readonly key: string;
  readonly value: string | number;
  /** `numeric` drives weighted seeding; `categorical` drives draw constraints. */
  readonly kind: 'numeric' | 'categorical';
}

/** One entrant's attributes within a tournament. */
export interface EntrantAttributes {
  readonly entrantId: string;
  readonly attributes: readonly EntrantAttribute[];
}

export class EntrantAttributeError extends DomainError {
  readonly code = 'ENTRANT_ATTRIBUTE_INVALID';
}

/**
 * The system attaches no meaning to a key, but it does insist a value matches
 * the kind it was declared under: a `ranking` that arrived as `"12th"` would
 * sort as a string and silently produce a wrong seed order.
 */
export function validateAttributes(
  input: EntrantAttributes,
): Result<EntrantAttributes, EntrantAttributeError> {
  const seen = new Set<string>();

  for (const attribute of input.attributes) {
    if (attribute.key.trim() === '') {
      return err(
        new EntrantAttributeError('An attribute key cannot be empty', {
          entrantId: input.entrantId,
        }),
      );
    }
    if (seen.has(attribute.key)) {
      return err(
        new EntrantAttributeError(`Attribute "${attribute.key}" is declared more than once`, {
          entrantId: input.entrantId,
          key: attribute.key,
        }),
      );
    }
    seen.add(attribute.key);

    const numeric = typeof attribute.value === 'number';
    if (attribute.kind === 'numeric' && (!numeric || !Number.isFinite(attribute.value))) {
      return err(
        new EntrantAttributeError(
          `Attribute "${attribute.key}" is declared numeric but its value is not a finite number`,
          { entrantId: input.entrantId, key: attribute.key, value: attribute.value },
        ),
      );
    }
    if (attribute.kind === 'categorical' && numeric) {
      return err(
        new EntrantAttributeError(
          `Attribute "${attribute.key}" is declared categorical but carries a number; ` +
            'declare it numeric, or record the value as a string',
          { entrantId: input.entrantId, key: attribute.key, value: attribute.value },
        ),
      );
    }
  }

  return ok(input);
}

/** Reads one attribute value, or undefined when the entrant does not carry it. */
export function attributeValue(
  attributes: readonly EntrantAttribute[],
  key: string,
): string | number | undefined {
  return attributes.find((attribute) => attribute.key === key)?.value;
}

export function numericAttribute(
  attributes: readonly EntrantAttribute[],
  key: string,
): number | undefined {
  const value = attributeValue(attributes, key);
  return typeof value === 'number' ? value : undefined;
}

export function categoricalAttribute(
  attributes: readonly EntrantAttribute[],
  key: string,
): string | undefined {
  const value = attributeValue(attributes, key);
  return typeof value === 'string' ? value : undefined;
}

/**
 * Weighted seeding ranks on an attribute, so an entrant missing it has no
 * position at all. Failing the whole stage configuration is the right answer:
 * seeding half a field by ranking and the rest arbitrarily is worse than
 * refusing, and the operator can see exactly who is missing a value.
 */
export function assertWeightingComplete(
  entrants: readonly Entrant[],
  attributesByEntrant: ReadonlyMap<string, readonly EntrantAttribute[]>,
  key: string,
): Result<true, EntrantAttributeError> {
  const missing = entrants
    .filter(
      (entrant) =>
        numericAttribute(attributesByEntrant.get(entrant.entrantId) ?? [], key) === undefined,
    )
    .map((entrant) => entrant.entrantId);

  if (missing.length > 0) {
    return err(
      new EntrantAttributeError(
        `Weighted seeding on "${key}" requires every entrant to carry it; ${missing.length} do not`,
        { key, missing },
      ),
    );
  }
  return ok(true);
}
