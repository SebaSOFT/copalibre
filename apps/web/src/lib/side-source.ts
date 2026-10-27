import { applyTemplate } from './matches-view.js';

/** Structural source fields shared by persisted projections and legacy bracket previews. */
export interface SideSource {
  readonly kind: 'entrant' | 'winner-of' | 'loser-of' | 'qualifier' | 'seed' | 'bye' | 'pending';
  readonly entrantId?: string;
  readonly nodeKey?: string;
  readonly matchId?: string;
  readonly matchNumber?: number;
  readonly round?: number;
  readonly position?: number;
  readonly seed?: number;
  /** How a qualifier position reads before anyone qualifies; absent on every other kind. */
  readonly qualifierLabel?: QualifierLabel;
}

/** Label parts of a qualifier position, as the API derives them from the promotion plan. */
export interface QualifierLabel {
  readonly kind: 'group-rank' | 'cohort' | 'number';
  readonly rank?: number;
  readonly groupNumber?: number;
  readonly groupName?: string;
  readonly order?: number;
  readonly number?: number;
}

export const SIDE_SOURCE_KEYS = [
  'winner',
  'loser',
  'winnerShort',
  'loserShort',
  'awaiting',
  'round',
  'roundShort',
  'match',
  'matchShort',
  'final',
  'finalShort',
  'semiFinal',
  'semiFinalShort',
  'quarterFinal',
  'quarterFinalShort',
  'place',
  'places',
  'unknown',
  'seed',
  'bye',
  'qualifierGroup',
  'qualifierGroupNumber',
  'qualifierBest',
  'qualifierNthBest',
  'qualifierRunnerUp',
  'qualifier',
  'qualifierShort',
  'ordinal1',
  'ordinal2',
  'ordinal3',
  'ordinalOther',
] as const;
export type SideSourceMessages = Readonly<Record<(typeof SIDE_SOURCE_KEYS)[number], string>>;
export interface SourceText {
  readonly long: string;
  readonly short: string;
}

/** Placement meaning comes from structural keys, never an API's English display label. */
export function formatPlacementSource(
  key: string,
  messages: SideSourceMessages,
): string | undefined {
  const generatedPlacement = /^PL(\d+)-R\d+-M\d+(?:-G\d+)?$/.exec(key);
  if (generatedPlacement) {
    return applyTemplate(messages.place, { place: generatedPlacement[1] ?? '' });
  }
  const places = /^(?:placement|places?)-(\d+)(?:-(\d+))?$/.exec(key);
  if (!places) return undefined;
  return places[2] === undefined
    ? applyTemplate(messages.place, { place: places[1] ?? '' })
    : applyTemplate(messages.places, { from: places[1] ?? '', to: places[2] });
}

/** A human label for generated bracket ids such as `SE-R2-M1` or `PL5-R1-M1`. */
export function formatMatchRef(
  key: string,
  messages: SideSourceMessages,
  options: { readonly finalRound?: number; readonly matchNumber?: number } = {},
): string {
  const placement = formatPlacementSource(key, messages);
  if (placement !== undefined) return placement;

  const structural = /^(?:SE|WB|LB|GF)-R(\d+)-M(\d+)(?:-G\d+)?$/.exec(key);
  if (structural) {
    const source = {
      kind: 'winner-of' as const,
      nodeKey: key,
      round: Number(structural[1]),
      position: Number(structural[2]),
    };
    return (
      sourceMatchLabel(source, messages, options.finalRound)?.long ??
      applyTemplate(messages.round, {
        round: source.round,
        position: source.position,
      })
    );
  }

  return applyTemplate(messages.match, { position: options.matchNumber ?? 1 });
}

export interface Placement {
  readonly from: number;
  readonly to?: number;
}

/**
 * The places a placement game settles, from its structural key: `placement-N` settles one place;
 * a `PL{N}-R{r}-M{p}` round spans two places per match in that round, so it reads its siblings.
 */
export function placementOf(
  nodeKey: string | undefined,
  siblingKeys: readonly (string | undefined)[],
): Placement | undefined {
  const single = /^placement-(\d+)$/.exec(nodeKey ?? '');
  if (single) return { from: Number(single[1]) };
  const range = /^PL(\d+)-R(\d+)-M\d+$/.exec(nodeKey ?? '');
  if (!range) return undefined;
  const prefix = `PL${range[1]}-R${range[2]}-M`;
  const matches = siblingKeys.filter((key) => key?.startsWith(prefix)).length;
  const from = Number(range[1]);
  return { from, to: from + 2 * matches - 1 };
}

export function formatPlacement(placement: Placement, messages: SideSourceMessages): string {
  return placement.to === undefined
    ? applyTemplate(messages.place, { place: placement.from })
    : applyTemplate(messages.places, { from: placement.from, to: placement.to });
}

/**
 * A referenced match's name. Only a known single-elimination depth earns final-round names; a
 * source with neither round nor position names nothing, so the caller falls back to `unknown`.
 */
export function sourceMatchLabel(
  source: SideSource,
  messages: SideSourceMessages,
  finalRound?: number,
): SourceText | undefined {
  const key = source.nodeKey ?? source.matchId ?? '';
  const placement = formatPlacementSource(key, messages);
  if (placement !== undefined) return { long: placement, short: placement };
  const structural = /^(?:SE|WB|LB)-R(\d+)-M(\d+)(?:-G\d+)?$/.exec(key);
  const round = source.round ?? (structural ? Number(structural[1]) : undefined);
  const matchNumber =
    source.matchNumber !== undefined && source.matchNumber > 0 ? source.matchNumber : undefined;
  const position =
    source.position ?? matchNumber ?? (structural ? Number(structural[2]) : undefined);
  if (round === undefined && position === undefined) return undefined;
  const distance =
    key.startsWith('SE-') && finalRound !== undefined && round !== undefined
      ? finalRound - round
      : undefined;
  const name =
    distance === 0
      ? 'final'
      : distance === 1
        ? 'semiFinal'
        : distance === 2
          ? 'quarterFinal'
          : undefined;
  const values = { round: round ?? '', position: position ?? '' };
  return {
    long: applyTemplate(
      name === undefined ? (round === undefined ? messages.match : messages.round) : messages[name],
      values,
    ).trim(),
    short: applyTemplate(
      name === undefined
        ? round === undefined
          ? messages.matchShort
          : messages.roundShort
        : messages[`${name}Short`],
      values,
    ).trim(),
  };
}

/** A small ordinal from the catalogue: three irregular forms, then one template for the rest. */
function ordinalOf(value: number, messages: SideSourceMessages): string {
  if (value === 1) return messages.ordinal1;
  if (value === 2) return messages.ordinal2;
  if (value === 3) return messages.ordinal3;
  return applyTemplate(messages.ordinalOther, { n: value });
}

/**
 * A qualifier position by its plan's label: "1st Group A" under group-then-rank, "2nd best
 * runner-up" under ranked combination, "Qualifier 5" under manual. The compact form is the rank
 * and the group's letter when the group name ends in one ("1A"), else the position number.
 */
export function formatQualifier(source: SideSource, messages: SideSourceMessages): SourceText {
  const label = source.qualifierLabel;
  const position = source.position ?? label?.number;
  const numbered = applyTemplate(messages.qualifierShort, { number: position ?? '' }).trim();
  if (label?.kind === 'group-rank' && label.rank !== undefined) {
    const group =
      label.groupName ??
      applyTemplate(messages.qualifierGroupNumber, { number: label.groupNumber ?? '' });
    const letter = /(?:^|\s)(\S{1,2})$/.exec(label.groupName ?? '')?.[1];
    return {
      long: applyTemplate(messages.qualifierGroup, {
        rank: ordinalOf(label.rank, messages),
        group,
      }).trim(),
      short: letter === undefined ? numbered : `${label.rank}${letter}`,
    };
  }
  if (label?.kind === 'cohort' && label.rank !== undefined && label.order !== undefined) {
    const rank = label.rank === 2 ? messages.qualifierRunnerUp : ordinalOf(label.rank, messages);
    return {
      long: (label.order === 1
        ? applyTemplate(messages.qualifierBest, { rank })
        : applyTemplate(messages.qualifierNthBest, {
            order: ordinalOf(label.order, messages),
            rank,
          })
      ).trim(),
      short: numbered,
    };
  }
  if (position === undefined) return { long: messages.unknown, short: messages.unknown };
  return {
    long: applyTemplate(messages.qualifier, { number: position }).trim(),
    short: numbered,
  };
}

/** Pure, framework-free formatting; every word and compact form comes from the caller's catalogue. */
export function formatSideSource(
  source: SideSource | undefined,
  messages: SideSourceMessages,
  matchLabel?: SourceText,
): SourceText {
  const match =
    source?.kind === 'winner-of' || source?.kind === 'loser-of'
      ? (matchLabel ?? sourceMatchLabel(source, messages))
      : undefined;
  if ((source?.kind === 'winner-of' || source?.kind === 'loser-of') && match !== undefined) {
    return {
      long: applyTemplate(source.kind === 'winner-of' ? messages.winner : messages.loser, {
        match: match.long,
      }),
      short: applyTemplate(
        source.kind === 'winner-of' ? messages.winnerShort : messages.loserShort,
        { match: match.short },
      ),
    };
  }
  if (source?.kind === 'qualifier') return formatQualifier(source, messages);
  const text =
    source?.kind === 'seed'
      ? applyTemplate(messages.seed, { seed: source.seed ?? '' })
      : source?.kind === 'bye'
        ? messages.bye
        : messages.unknown;
  return { long: text.trim(), short: text.trim() };
}

export function finalRoundOf(
  matches: readonly { readonly nodeKey?: string; readonly round?: number }[],
): number | undefined {
  const rounds = matches
    .filter((match) => match.nodeKey?.startsWith('SE-'))
    .map((match) => match.round ?? 0);
  return rounds.length === 0 ? undefined : Math.max(...rounds);
}
