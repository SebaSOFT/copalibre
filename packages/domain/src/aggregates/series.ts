import type { Match } from './competition.js';
import type { RuleScript } from '../descriptors/discipline-descriptor.js';
import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

export type SeriesResolutionClass = 'best-of' | 'aggregate' | 'points-per-leg';

export type SeriesAccountingGrain = 'series' | 'match';

export interface SeriesDeclaration {
  /** Total number of scheduled matches in the series (e.g. 2, 3, 5, 7). */
  readonly span: number;
  /** Closed set of declarative resolution classes. Mutually exclusive with `resolutionScript`. */
  readonly resolutionClass?: SeriesResolutionClass;
  /** Custom script for series resolution. Mutually exclusive with `resolutionClass`. */
  readonly resolutionScript?: RuleScript;
  /** Whether the series is held on neutral ground (no home/away side alternation). */
  readonly neutralGround?: boolean;
  /** Whether standings account one outcome per series ('series') or per played match ('match'). */
  readonly standingsAccounting?: SeriesAccountingGrain;
}

export class SeriesConfigurationError extends DomainError {
  readonly code = 'SERIES_CONFIGURATION_INVALID';
}

export type SeriesResolutionStatus = 'decided' | 'undecided' | 'finished-unresolved';

export interface SeriesTraceNode {
  readonly kind:
    'rule' | 'condition' | 'action' | 'aggregation' | 'series' | 'comparator' | 'guard';
  readonly id: string;
  readonly label: string;
  readonly outcome: string;
  readonly values?: Readonly<Record<string, unknown>>;
  readonly detail?: string;
  readonly children?: readonly SeriesTraceNode[];
}

export interface SeriesResolutionResult {
  readonly status: SeriesResolutionStatus;
  readonly winnerEntrantId?: string;
  readonly loserEntrantId?: string;
  readonly explanation: string;
  readonly trace: readonly SeriesTraceNode[];
  readonly matchesPlayed: number;
  readonly span: number;
  /** Match numbers (1-based) that were scheduled but are no longer required after a decision. */
  readonly anulledMatchNumbers: readonly number[];
}

/**
 * Validates a series declaration document according to domain rules:
 * - span must be an integer >= 2
 * - best-of must have an odd span
 * - resolutionClass and resolutionScript are mutually exclusive
 * - exactly one of resolutionClass or resolutionScript must be declared
 */
export function validateSeriesDeclaration(
  declaration: unknown,
): Result<SeriesDeclaration, SeriesConfigurationError> {
  if (!declaration || typeof declaration !== 'object') {
    return err(
      new SeriesConfigurationError('Series declaration must be an object', {
        field: 'series',
      }),
    );
  }

  const doc = declaration as Record<string, unknown>;

  if (typeof doc.span !== 'number' || !Number.isInteger(doc.span) || doc.span < 2) {
    return err(
      new SeriesConfigurationError(
        `Series span must be an integer of at least 2; received ${String(doc.span)}`,
        { field: 'series.span', span: doc.span },
      ),
    );
  }

  const hasClass = doc.resolutionClass !== undefined;
  const hasScript = doc.resolutionScript !== undefined;

  if (hasClass && hasScript) {
    return err(
      new SeriesConfigurationError(
        'A series cannot declare both a resolution class and a resolution script',
        { field: 'series.resolutionScript', resolutionClass: doc.resolutionClass },
      ),
    );
  }

  if (!hasClass && !hasScript) {
    return err(
      new SeriesConfigurationError(
        'A series must declare either a resolution class or a resolution script',
        { field: 'series.resolutionClass' },
      ),
    );
  }

  if (hasClass) {
    const validClasses: SeriesResolutionClass[] = ['best-of', 'aggregate', 'points-per-leg'];
    if (!validClasses.includes(doc.resolutionClass as SeriesResolutionClass)) {
      return err(
        new SeriesConfigurationError(
          `Invalid series resolution class "${String(doc.resolutionClass)}". Supported: ${validClasses.join(', ')}`,
          { field: 'series.resolutionClass', resolutionClass: doc.resolutionClass },
        ),
      );
    }

    if (doc.resolutionClass === 'best-of' && doc.span % 2 === 0) {
      return err(
        new SeriesConfigurationError(
          `A best-of series must have an odd span so a majority exists; an even span of ${doc.span} ` +
            'has no majority. Use "aggregate" or "points-per-leg" for an even-span series instead.',
          { field: 'series.span', span: doc.span },
        ),
      );
    }
  }

  if (doc.neutralGround !== undefined && typeof doc.neutralGround !== 'boolean') {
    return err(
      new SeriesConfigurationError('Series neutralGround must be a boolean', {
        field: 'series.neutralGround',
      }),
    );
  }

  if (
    doc.standingsAccounting !== undefined &&
    doc.standingsAccounting !== 'series' &&
    doc.standingsAccounting !== 'match'
  ) {
    return err(
      new SeriesConfigurationError(
        `Series standingsAccounting must be "series" or "match"; received "${String(doc.standingsAccounting)}"`,
        { field: 'series.standingsAccounting', standingsAccounting: doc.standingsAccounting },
      ),
    );
  }

  return ok({
    span: doc.span,
    resolutionClass: doc.resolutionClass as SeriesResolutionClass | undefined,
    resolutionScript: doc.resolutionScript as RuleScript | undefined,
    neutralGround: doc.neutralGround as boolean | undefined,
    standingsAccounting: doc.standingsAccounting as SeriesAccountingGrain | undefined,
  });
}

export interface ResolveSeriesInput {
  readonly declaration: SeriesDeclaration;
  readonly sides: readonly [string, string];
  readonly matches: readonly Pick<Match, 'number' | 'status' | 'result'>[];
  readonly pointsRules?: {
    readonly win: number;
    readonly draw: number;
    readonly loss?: number;
  };
}

/**
 * Pure evaluator for multi-match series resolution.
 * Reads finalized matches, evaluates decision rules based on resolution class,
 * and generates structured explanation trace and list of anulled surplus match numbers.
 */
export function resolveSeries(input: ResolveSeriesInput): SeriesResolutionResult {
  const { declaration, sides, matches } = input;
  const [sideA, sideB] = sides;
  const span = declaration.span;

  // Filter finalized matches sorted by match number
  const finalizedMatches = matches
    .filter((m) => m.status === 'finalized' && m.result !== undefined)
    .sort((a, b) => a.number - b.number);

  const matchesPlayed = finalizedMatches.length;

  if (declaration.resolutionClass === 'best-of') {
    return resolveBestOf({ declaration, sideA, sideB, finalizedMatches, span });
  }

  if (declaration.resolutionClass === 'aggregate') {
    return resolveAggregate({ declaration, sideA, sideB, finalizedMatches, span });
  }

  if (declaration.resolutionClass === 'points-per-leg') {
    return resolvePointsPerLeg({
      declaration,
      sideA,
      sideB,
      finalizedMatches,
      span,
      pointsRules: input.pointsRules ?? { win: 3, draw: 1, loss: 0 },
    });
  }

  // If scripted series without runtime evaluator, report undecided if not all finalized
  const children: SeriesTraceNode[] = finalizedMatches.map((m) => ({
    kind: 'series',
    id: `match-${m.number}`,
    label: `Match ${m.number}`,
    outcome: m.result?.winnerEntrantId ? `Won by ${m.result.winnerEntrantId}` : 'Draw',
    values: { winnerEntrantId: m.result?.winnerEntrantId },
  }));

  if (matchesPlayed < span) {
    return {
      status: 'undecided',
      explanation: `Scripted series waiting for ${span - matchesPlayed} further match(es)`,
      trace: [
        {
          kind: 'series',
          id: 'scripted-series-resolution',
          label: 'Scripted Series Resolution',
          outcome: 'undecided',
          detail: `Waiting for all ${span} matches before script evaluation`,
          children,
        },
      ],
      matchesPlayed,
      span,
      anulledMatchNumbers: [],
    };
  }

  return {
    status: 'undecided',
    explanation: 'Scripted series requires rules engine hook evaluation',
    trace: [
      {
        kind: 'series',
        id: 'scripted-series-resolution',
        label: 'Scripted Series Resolution',
        outcome: 'pending-hook-evaluation',
        children,
      },
    ],
    matchesPlayed,
    span,
    anulledMatchNumbers: [],
  };
}

function resolveBestOf(params: {
  declaration: SeriesDeclaration;
  sideA: string;
  sideB: string;
  finalizedMatches: readonly Pick<Match, 'number' | 'status' | 'result'>[];
  span: number;
}): SeriesResolutionResult {
  const { sideA, sideB, finalizedMatches, span } = params;
  const targetWins = Math.floor(span / 2) + 1;

  let winsA = 0;
  let winsB = 0;
  let draws = 0;

  const matchTraceChildren: SeriesTraceNode[] = [];

  for (const m of finalizedMatches) {
    const winner = m.result?.winnerEntrantId;
    if (winner === sideA) {
      winsA++;
    } else if (winner === sideB) {
      winsB++;
    } else {
      draws++;
    }

    matchTraceChildren.push({
      kind: 'series',
      id: `match-${m.number}`,
      label: `Match ${m.number}`,
      outcome: winner ? `Won by ${winner}` : 'Draw',
      values: { winnerEntrantId: winner, number: m.number },
    });
  }

  const matchesPlayed = finalizedMatches.length;
  const remainingMatches = span - matchesPlayed;

  if (winsA >= targetWins) {
    const lastPlayedNumber = finalizedMatches[finalizedMatches.length - 1]?.number ?? matchesPlayed;
    const anulledMatchNumbers = Array.from(
      { length: span - lastPlayedNumber },
      (_, i) => lastPlayedNumber + i + 1,
    );

    return {
      status: 'decided',
      winnerEntrantId: sideA,
      loserEntrantId: sideB,
      explanation: `Best-of-${span} series won by ${sideA} (${winsA}-${winsB})`,
      trace: [
        {
          kind: 'series',
          id: 'best-of-series-resolution',
          label: `Best-of-${span} Resolution`,
          outcome: 'decided',
          detail: `${sideA} reached required ${targetWins} wins`,
          values: {
            class: 'best-of',
            span,
            targetWins,
            [sideA]: winsA,
            [sideB]: winsB,
            winnerEntrantId: sideA,
          },
          children: matchTraceChildren,
        },
      ],
      matchesPlayed,
      span,
      anulledMatchNumbers,
    };
  }

  if (winsB >= targetWins) {
    const lastPlayedNumber = finalizedMatches[finalizedMatches.length - 1]?.number ?? matchesPlayed;
    const anulledMatchNumbers = Array.from(
      { length: span - lastPlayedNumber },
      (_, i) => lastPlayedNumber + i + 1,
    );

    return {
      status: 'decided',
      winnerEntrantId: sideB,
      loserEntrantId: sideA,
      explanation: `Best-of-${span} series won by ${sideB} (${winsB}-${winsA})`,
      trace: [
        {
          kind: 'series',
          id: 'best-of-series-resolution',
          label: `Best-of-${span} Resolution`,
          outcome: 'decided',
          detail: `${sideB} reached required ${targetWins} wins`,
          values: {
            class: 'best-of',
            span,
            targetWins,
            [sideA]: winsA,
            [sideB]: winsB,
            winnerEntrantId: sideB,
          },
          children: matchTraceChildren,
        },
      ],
      matchesPlayed,
      span,
      anulledMatchNumbers,
    };
  }

  // Check if it's impossible for either to reach targetWins (e.g. all matches played with draws)
  if (winsA + remainingMatches < targetWins && winsB + remainingMatches < targetWins) {
    return {
      status: 'finished-unresolved',
      explanation: `Best-of-${span} finished unresolved: neither side can reach ${targetWins} wins (${winsA}-${winsB}, ${draws} draws)`,
      trace: [
        {
          kind: 'series',
          id: 'best-of-series-resolution',
          label: `Best-of-${span} Resolution`,
          outcome: 'finished-unresolved',
          detail: `Neither side reached majority of ${targetWins} wins`,
          values: {
            class: 'best-of',
            span,
            targetWins,
            [sideA]: winsA,
            [sideB]: winsB,
            draws,
          },
          children: matchTraceChildren,
        },
      ],
      matchesPlayed,
      span,
      anulledMatchNumbers: [],
    };
  }

  const neededA = targetWins - winsA;
  const neededB = targetWins - winsB;

  return {
    status: 'undecided',
    explanation: `Best-of-${span} series stands at ${winsA}-${winsB}. ${sideA} needs ${neededA} win(s), ${sideB} needs ${neededB} win(s).`,
    trace: [
      {
        kind: 'series',
        id: 'best-of-series-resolution',
        label: `Best-of-${span} Resolution`,
        outcome: 'undecided',
        detail: `No side has reached majority of ${targetWins} wins. ${sideA} needs ${neededA} more win(s); ${sideB} needs ${neededB} more win(s).`,
        values: {
          class: 'best-of',
          span,
          targetWins,
          [sideA]: { wins: winsA, neededWins: neededA },
          [sideB]: { wins: winsB, neededWins: neededB },
        },
        children: matchTraceChildren,
      },
    ],
    matchesPlayed,
    span,
    anulledMatchNumbers: [],
  };
}

function resolveAggregate(params: {
  declaration: SeriesDeclaration;
  sideA: string;
  sideB: string;
  finalizedMatches: readonly Pick<Match, 'number' | 'status' | 'result'>[];
  span: number;
}): SeriesResolutionResult {
  const { sideA, sideB, finalizedMatches, span } = params;

  let totalScoreA = 0;
  let totalScoreB = 0;

  const matchTraceChildren: SeriesTraceNode[] = [];

  for (const m of finalizedMatches) {
    const sideScoreA = m.result?.sides.find((s) => s.entrantId === sideA);
    const sideScoreB = m.result?.sides.find((s) => s.entrantId === sideB);

    const scoreA = (sideScoreA?.statistics?.score ??
      sideScoreA?.statistics?.goals ??
      sideScoreA?.statistics?.points ??
      0) as number;
    const scoreB = (sideScoreB?.statistics?.score ??
      sideScoreB?.statistics?.goals ??
      sideScoreB?.statistics?.points ??
      0) as number;

    totalScoreA += scoreA;
    totalScoreB += scoreB;

    matchTraceChildren.push({
      kind: 'series',
      id: `match-${m.number}`,
      label: `Match ${m.number}`,
      outcome: `${sideA} ${scoreA} - ${scoreB} ${sideB}`,
      values: {
        number: m.number,
        [sideA]: scoreA,
        [sideB]: scoreB,
      },
    });
  }

  const matchesPlayed = finalizedMatches.length;

  if (matchesPlayed < span) {
    return {
      status: 'undecided',
      explanation: `Aggregate series in progress (${totalScoreA}-${totalScoreB} after ${matchesPlayed}/${span} matches)`,
      trace: [
        {
          kind: 'series',
          id: 'aggregate-series-resolution',
          label: `Aggregate Series (${span} legs)`,
          outcome: 'undecided',
          detail: `Waiting for all ${span} legs to conclude`,
          values: {
            class: 'aggregate',
            span,
            matchesPlayed,
            [sideA]: totalScoreA,
            [sideB]: totalScoreB,
          },
          children: matchTraceChildren,
        },
      ],
      matchesPlayed,
      span,
      anulledMatchNumbers: [],
    };
  }

  if (totalScoreA > totalScoreB) {
    return {
      status: 'decided',
      winnerEntrantId: sideA,
      loserEntrantId: sideB,
      explanation: `Aggregate series won by ${sideA} (${totalScoreA}-${totalScoreB} on aggregate)`,
      trace: [
        {
          kind: 'series',
          id: 'aggregate-series-resolution',
          label: `Aggregate Series (${span} legs)`,
          outcome: 'decided',
          detail: `${sideA} won with ${totalScoreA} to ${totalScoreB} on aggregate`,
          values: {
            class: 'aggregate',
            span,
            [sideA]: totalScoreA,
            [sideB]: totalScoreB,
            winnerEntrantId: sideA,
          },
          children: matchTraceChildren,
        },
      ],
      matchesPlayed,
      span,
      anulledMatchNumbers: [],
    };
  }

  if (totalScoreB > totalScoreA) {
    return {
      status: 'decided',
      winnerEntrantId: sideB,
      loserEntrantId: sideA,
      explanation: `Aggregate series won by ${sideB} (${totalScoreB}-${totalScoreA} on aggregate)`,
      trace: [
        {
          kind: 'series',
          id: 'aggregate-series-resolution',
          label: `Aggregate Series (${span} legs)`,
          outcome: 'decided',
          detail: `${sideB} won with ${totalScoreB} to ${totalScoreA} on aggregate`,
          values: {
            class: 'aggregate',
            span,
            [sideA]: totalScoreA,
            [sideB]: totalScoreB,
            winnerEntrantId: sideB,
          },
          children: matchTraceChildren,
        },
      ],
      matchesPlayed,
      span,
      anulledMatchNumbers: [],
    };
  }

  // Level aggregate
  return {
    status: 'finished-unresolved',
    explanation: `Aggregate series finished level (${totalScoreA}-${totalScoreB}); tiebreak criterion required`,
    trace: [
      {
        kind: 'series',
        id: 'aggregate-series-resolution',
        label: `Aggregate Series (${span} legs)`,
        outcome: 'finished-unresolved',
        detail: `Aggregate score is tied at ${totalScoreA}-${totalScoreB}`,
        values: {
          class: 'aggregate',
          span,
          [sideA]: totalScoreA,
          [sideB]: totalScoreB,
          reason: 'level-aggregate',
        },
        children: matchTraceChildren,
      },
    ],
    matchesPlayed,
    span,
    anulledMatchNumbers: [],
  };
}

function resolvePointsPerLeg(params: {
  declaration: SeriesDeclaration;
  sideA: string;
  sideB: string;
  finalizedMatches: readonly Pick<Match, 'number' | 'status' | 'result'>[];
  span: number;
  pointsRules: { win: number; draw: number; loss?: number };
}): SeriesResolutionResult {
  const { sideA, sideB, finalizedMatches, span, pointsRules } = params;
  const lossPoints = pointsRules.loss ?? 0;

  let pointsA = 0;
  let pointsB = 0;

  const matchTraceChildren: SeriesTraceNode[] = [];

  for (const m of finalizedMatches) {
    const winner = m.result?.winnerEntrantId;
    const matchPointsA =
      winner === sideA ? pointsRules.win : winner === sideB ? lossPoints : pointsRules.draw;
    const matchPointsB =
      winner === sideB ? pointsRules.win : winner === sideA ? lossPoints : pointsRules.draw;

    pointsA += matchPointsA;
    pointsB += matchPointsB;

    matchTraceChildren.push({
      kind: 'series',
      id: `match-${m.number}`,
      label: `Match ${m.number}`,
      outcome: winner
        ? `Won by ${winner} (${pointsRules.win} pts)`
        : `Draw (${pointsRules.draw} pts each)`,
      values: {
        number: m.number,
        winnerEntrantId: winner,
        [sideA]: matchPointsA,
        [sideB]: matchPointsB,
      },
    });
  }

  const matchesPlayed = finalizedMatches.length;
  const remainingMatches = span - matchesPlayed;
  const maxPossibleAdd = remainingMatches * pointsRules.win;

  if (pointsA > pointsB + maxPossibleAdd) {
    const lastPlayedNumber = finalizedMatches[finalizedMatches.length - 1]?.number ?? matchesPlayed;
    const anulledMatchNumbers = Array.from(
      { length: span - lastPlayedNumber },
      (_, i) => lastPlayedNumber + i + 1,
    );

    return {
      status: 'decided',
      winnerEntrantId: sideA,
      loserEntrantId: sideB,
      explanation: `Points-per-leg series won by ${sideA} (${pointsA} pts to ${pointsB} pts)`,
      trace: [
        {
          kind: 'series',
          id: 'points-per-leg-series-resolution',
          label: `Points-per-Leg (${span} legs)`,
          outcome: 'decided',
          detail: `${sideA} clinched mathematically unreachable points lead`,
          values: {
            class: 'points-per-leg',
            span,
            [sideA]: pointsA,
            [sideB]: pointsB,
            winnerEntrantId: sideA,
          },
          children: matchTraceChildren,
        },
      ],
      matchesPlayed,
      span,
      anulledMatchNumbers,
    };
  }

  if (pointsB > pointsA + maxPossibleAdd) {
    const lastPlayedNumber = finalizedMatches[finalizedMatches.length - 1]?.number ?? matchesPlayed;
    const anulledMatchNumbers = Array.from(
      { length: span - lastPlayedNumber },
      (_, i) => lastPlayedNumber + i + 1,
    );

    return {
      status: 'decided',
      winnerEntrantId: sideB,
      loserEntrantId: sideA,
      explanation: `Points-per-leg series won by ${sideB} (${pointsB} pts to ${pointsA} pts)`,
      trace: [
        {
          kind: 'series',
          id: 'points-per-leg-series-resolution',
          label: `Points-per-Leg (${span} legs)`,
          outcome: 'decided',
          detail: `${sideB} clinched mathematically unreachable points lead`,
          values: {
            class: 'points-per-leg',
            span,
            [sideA]: pointsA,
            [sideB]: pointsB,
            winnerEntrantId: sideB,
          },
          children: matchTraceChildren,
        },
      ],
      matchesPlayed,
      span,
      anulledMatchNumbers,
    };
  }

  if (matchesPlayed === span) {
    if (pointsA > pointsB) {
      return {
        status: 'decided',
        winnerEntrantId: sideA,
        loserEntrantId: sideB,
        explanation: `Points-per-leg series won by ${sideA} (${pointsA}-${pointsB})`,
        trace: [
          {
            kind: 'series',
            id: 'points-per-leg-series-resolution',
            label: `Points-per-Leg (${span} legs)`,
            outcome: 'decided',
            values: { class: 'points-per-leg', span, [sideA]: pointsA, [sideB]: pointsB },
            children: matchTraceChildren,
          },
        ],
        matchesPlayed,
        span,
        anulledMatchNumbers: [],
      };
    }
    if (pointsB > pointsA) {
      return {
        status: 'decided',
        winnerEntrantId: sideB,
        loserEntrantId: sideA,
        explanation: `Points-per-leg series won by ${sideB} (${pointsB}-${pointsA})`,
        trace: [
          {
            kind: 'series',
            id: 'points-per-leg-series-resolution',
            label: `Points-per-Leg (${span} legs)`,
            outcome: 'decided',
            values: { class: 'points-per-leg', span, [sideA]: pointsA, [sideB]: pointsB },
            children: matchTraceChildren,
          },
        ],
        matchesPlayed,
        span,
        anulledMatchNumbers: [],
      };
    }
    return {
      status: 'finished-unresolved',
      explanation: `Points-per-leg series finished level (${pointsA}-${pointsB} pts)`,
      trace: [
        {
          kind: 'series',
          id: 'points-per-leg-series-resolution',
          label: `Points-per-Leg (${span} legs)`,
          outcome: 'finished-unresolved',
          values: { class: 'points-per-leg', span, [sideA]: pointsA, [sideB]: pointsB },
          children: matchTraceChildren,
        },
      ],
      matchesPlayed,
      span,
      anulledMatchNumbers: [],
    };
  }

  return {
    status: 'undecided',
    explanation: `Points-per-leg series in progress (${pointsA}-${pointsB} pts after ${matchesPlayed}/${span} matches)`,
    trace: [
      {
        kind: 'series',
        id: 'points-per-leg-series-resolution',
        label: `Points-per-Leg (${span} legs)`,
        outcome: 'undecided',
        values: {
          class: 'points-per-leg',
          span,
          matchesPlayed,
          [sideA]: pointsA,
          [sideB]: pointsB,
        },
        children: matchTraceChildren,
      },
    ],
    matchesPlayed,
    span,
    anulledMatchNumbers: [],
  };
}
