import type { DisciplineDescriptor } from '@copalibre/domain';
import type { TiebreakParameterDefinition, TiebreakPipeline } from '@copalibre/rules';

/**
 * Where a stage's comparator chain comes from.
 *
 * CopaLibre enforces what *this* organizer configured and nothing a sport
 * "usually" does, so the order of precedence is: what the stage declares, then
 * the one comparator the engine already computes on its own, then nothing.
 *
 * "Then nothing" is a real answer, not a gap to paper over. A tournament with
 * no declared tiebreak has not asked anybody to be ranked below anybody else,
 * and an invented chain would produce a placement no organizer chose and no
 * trace could justify.
 */

/** A comparator as a stage configuration declares it. */
export interface DeclaredTiebreak {
  readonly statisticCode: string;
  readonly label?: string;
  readonly direction?: 'higher_wins' | 'lower_wins';
  readonly missingValue?: 'treat-as-worst' | 'treat-as-zero' | 'invalid';
}

/** The statistic code the engine's own win/draw/loss accounting writes. */
export const ENGINE_POINTS_CODE = 'points';

export function standingsPipeline(
  descriptor: DisciplineDescriptor,
  overrides: Readonly<Record<string, unknown>> = {},
): TiebreakPipeline {
  const declared = declaredTiebreaks(overrides, descriptor);
  if (declared.length > 0) {
    return {
      id: 'stage-configured',
      version: 1,
      parameters: declared.map((entry, index) => parameterOf(descriptor, entry, index)),
    };
  }

  // The engine derives points from the outcome itself when the discipline
  // declares the statistic; ranking on it is reading what was already computed,
  // not adding a rule.
  const points = descriptor.statistics.find((stat) => stat.code === ENGINE_POINTS_CODE);
  if (points) {
    return {
      id: 'engine-points',
      version: 1,
      parameters: [
        {
          id: points.code,
          label: points.label,
          valueType: 'number',
          direction: 'higher_wins',
          missingValue: 'treat-as-zero',
          source: 'calculated',
        },
      ],
    };
  }

  return { id: 'unconfigured', version: 1, parameters: [] };
}

/**
 * Reads `tiebreakers` or `standings.tiebreak` off the stage overrides or discipline defaults.
 *
 * Defensive about shape because overrides are operator-authored JSON: a
 * malformed entry is skipped rather than thrown, so one bad comparator does not
 * take the standings screen down for a tournament that is being played.
 */
export function declaredTiebreaks(
  overrides: Readonly<Record<string, unknown>> = {},
  descriptor?: DisciplineDescriptor,
): readonly DeclaredTiebreak[] {
  const standings = overrides['standings'];
  const standingsObj =
    typeof standings === 'object' && standings !== null
      ? (standings as Record<string, unknown>)
      : undefined;

  const rawTiebreak =
    overrides['tiebreakers'] ??
    standingsObj?.['tiebreakers'] ??
    standingsObj?.['tiebreak'] ??
    overrides['standings.tiebreakers'] ??
    overrides['standings.tiebreak'] ??
    descriptor?.defaults?.['tiebreakers'] ??
    (typeof descriptor?.defaults?.['standings'] === 'object' &&
    descriptor?.defaults?.['standings'] !== null
      ? ((descriptor.defaults['standings'] as Record<string, unknown>)['tiebreakers'] ??
        (descriptor.defaults['standings'] as Record<string, unknown>)['tiebreak'])
      : undefined);

  if (!Array.isArray(rawTiebreak)) return [];

  return rawTiebreak.flatMap((entry) => {
    if (typeof entry === 'string' && entry.trim().length > 0) {
      return [{ statisticCode: entry.trim() }];
    }
    if (typeof entry !== 'object' || entry === null) return [];
    const code = (entry as { readonly statisticCode?: unknown }).statisticCode;
    if (typeof code !== 'string' || code.length === 0) return [];
    return [entry as DeclaredTiebreak];
  });
}

function parameterOf(
  descriptor: DisciplineDescriptor,
  entry: DeclaredTiebreak,
  index: number,
): TiebreakParameterDefinition {
  const declared = descriptor.statistics.find((stat) => stat.code === entry.statisticCode);

  return {
    id: entry.statisticCode,
    label: entry.label ?? declared?.label ?? entry.statisticCode,
    valueType: 'number',
    direction: entry.direction ?? 'higher_wins',
    missingValue: entry.missingValue ?? 'treat-as-zero',
    source: 'calculated',
    // A comparator naming a statistic the bound discipline never declares reads
    // nothing. Annotating it makes the trace say so, instead of showing an
    // operator a rule that silently discriminated nobody.
    ...(declared === undefined
      ? { unboundCapability: `${entry.statisticCode} (comparator ${index + 1})` }
      : {}),
  };
}
