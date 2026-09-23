import type { FixtureGraph, SlotSource } from '@copalibre/tournament-engine';
import { isDuelMatch } from '@copalibre/tournament-engine';
import type { StageMatchRecord } from '@copalibre/persistence';

interface ReconstructedMatch {
  readonly record?: StageMatchRecord;
  readonly entrants: readonly [string, string] | readonly [string, undefined];
  readonly winnerEntrantId?: string;
  readonly loserEntrantId?: string;
}

type ResolvedSlot =
  { readonly kind: 'entrant'; readonly entrantId: string } | { readonly kind: 'bye' };

export interface ChampionshipFixture {
  readonly fixture: StageMatchRecord;
  readonly winnerEntrantId: string;
  readonly loserEntrantId: string;
}

/** Reconstructs which persisted fixture occupies the generated championship path. */
export function reconstructChampionshipFixture(input: {
  readonly graph: FixtureGraph;
  readonly records: readonly StageMatchRecord[];
  readonly winnerByFixtureId: ReadonlyMap<string, string>;
}): ChampionshipFixture | undefined {
  if (input.graph.format !== 'single-elimination' && input.graph.format !== 'double-elimination') {
    return undefined;
  }
  const reconstructed = reconstructMatches(input);

  if (input.graph.format === 'double-elimination') {
    return reconstructed ? doubleEliminationChampion(input.graph, reconstructed) : undefined;
  }

  if (reconstructed) {
    const terminalNodes = input.graph.matches.filter(
      (match) => isDuelMatch(match) && match.bracket === 'winners',
    );
    const terminalRound = Math.max(0, ...terminalNodes.map((match) => match.round));
    const finalNodes = terminalNodes.filter((match) => match.round === terminalRound);
    if (finalNodes.length === 1) {
      const finalId = finalNodes[0]?.id;
      // A mapped generated final is authoritative. Do not substitute a different
      // outcome-qualified match when its own recorded result is incomplete.
      if (finalId !== undefined && reconstructed.get(finalId)?.record !== undefined) {
        return championshipFixtureOf(finalId, reconstructed);
      }
    }
  }

  return singleEliminationOutcomeLineageFinal(input.records, input.winnerByFixtureId);
}

function singleEliminationOutcomeLineageFinal(
  records: readonly StageMatchRecord[],
  winnerByFixtureId: ReadonlyMap<string, string>,
): ChampionshipFixture | undefined {
  if (records.length === 0) return undefined;
  const deepestRound = Math.max(...records.map((record) => record.round));
  const candidates: ChampionshipFixture[] = [];

  for (const fixture of records) {
    if (
      fixture.round !== deepestRound ||
      fixture.status !== 'finalized' ||
      fixture.homeEntrantId === undefined ||
      fixture.awayEntrantId === undefined ||
      fixture.homeEntrantId === fixture.awayEntrantId
    ) {
      continue;
    }

    const winnerEntrantId = winnerByFixtureId.get(fixture.fixtureId);
    if (winnerEntrantId !== fixture.homeEntrantId && winnerEntrantId !== fixture.awayEntrantId) {
      continue;
    }

    const homePrior = latestPriorFinalizedMatch(records, fixture.homeEntrantId, fixture.round);
    const awayPrior = latestPriorFinalizedMatch(records, fixture.awayEntrantId, fixture.round);
    if (
      !homePrior ||
      !awayPrior ||
      homePrior.fixtureId === awayPrior.fixtureId ||
      winnerByFixtureId.get(homePrior.fixtureId) !== fixture.homeEntrantId ||
      winnerByFixtureId.get(awayPrior.fixtureId) !== fixture.awayEntrantId
    ) {
      continue;
    }

    candidates.push({
      fixture,
      winnerEntrantId,
      loserEntrantId:
        winnerEntrantId === fixture.homeEntrantId ? fixture.awayEntrantId : fixture.homeEntrantId,
    });
  }

  return candidates.length === 1 ? candidates[0] : undefined;
}

function latestPriorFinalizedMatch(
  records: readonly StageMatchRecord[],
  entrantId: string,
  beforeRound: number,
): StageMatchRecord | undefined {
  const prior = records.filter(
    (record) =>
      record.status === 'finalized' &&
      record.round < beforeRound &&
      (record.homeEntrantId === entrantId || record.awayEntrantId === entrantId),
  );
  if (prior.length === 0) return undefined;

  const latestRound = Math.max(...prior.map((record) => record.round));
  const latest = prior.filter((record) => record.round === latestRound);
  return latest.length === 1 ? latest[0] : undefined;
}

function reconstructMatches(input: {
  readonly graph: FixtureGraph;
  readonly records: readonly StageMatchRecord[];
  readonly winnerByFixtureId: ReadonlyMap<string, string>;
}): ReadonlyMap<string, ReconstructedMatch> | undefined {
  const matches = input.graph.matches.filter(isDuelMatch);
  const byId = new Map(matches.map((match) => [match.id, match]));
  const positionByMatchId = new Map<string, number>();
  const positionsByRound = new Map<number, number>();
  for (const match of matches) {
    const position = (positionsByRound.get(match.round) ?? 0) + 1;
    positionsByRound.set(match.round, position);
    positionByMatchId.set(match.id, position);
  }
  const reconstructed = new Map<string, ReconstructedMatch>();
  const usedFixtureIds = new Set<string>();

  // The generated graphs are acyclic, but double-elimination has parallel
  // branches whose generation order is not a topological order. Repeat until
  // every currently resolvable node has been matched or no further node moves.
  let changed = true;
  while (changed) {
    changed = false;
    for (const match of matches) {
      if (reconstructed.has(match.id)) continue;

      const sideA = resolveSlot(match.slotA, reconstructed, byId);
      const sideB = resolveSlot(match.slotB, reconstructed, byId);
      if (!sideA || !sideB) continue;

      if (sideA.kind === 'entrant' && sideB.kind === 'bye') {
        reconstructed.set(match.id, {
          entrants: [sideA.entrantId, undefined],
          winnerEntrantId: sideA.entrantId,
        });
        changed = true;
        continue;
      }
      if (sideA.kind === 'bye' && sideB.kind === 'entrant') {
        reconstructed.set(match.id, {
          entrants: [sideB.entrantId, undefined],
          winnerEntrantId: sideB.entrantId,
        });
        changed = true;
        continue;
      }
      if (sideA.kind !== 'entrant' || sideB.kind !== 'entrant') continue;

      // The persisted first round is the authoritative seed-slot ordering: the
      // read model exposes entrants in fixture-side order, not original seed
      // order. Position therefore anchors the winners-bracket opening round;
      // later nodes are identified by their resolved participants.
      let candidates = input.records.filter((record) => {
        if (record.round !== match.round) return false;
        if (match.bracket === 'winners' && match.round === 1) {
          return record.position === match.position;
        }
        return (
          record.homeEntrantId !== undefined &&
          record.awayEntrantId !== undefined &&
          samePair([record.homeEntrantId, record.awayEntrantId], [sideA.entrantId, sideB.entrantId])
        );
      });
      if (candidates.length > 1) {
        const expectedPosition = positionByMatchId.get(match.id);
        candidates = candidates.filter((record) => record.position === expectedPosition);
      }
      if (candidates.length !== 1) continue;

      const record = candidates[0];
      if (
        !record ||
        usedFixtureIds.has(record.fixtureId) ||
        record.homeEntrantId === undefined ||
        record.awayEntrantId === undefined
      ) {
        continue;
      }
      usedFixtureIds.add(record.fixtureId);

      const winnerEntrantId = input.winnerByFixtureId.get(record.fixtureId);
      const validWinner =
        winnerEntrantId === record.homeEntrantId || winnerEntrantId === record.awayEntrantId
          ? winnerEntrantId
          : undefined;
      reconstructed.set(match.id, {
        record,
        entrants: [record.homeEntrantId, record.awayEntrantId],
        ...(validWinner === undefined
          ? {}
          : {
              winnerEntrantId: validWinner,
              loserEntrantId:
                validWinner === record.homeEntrantId ? record.awayEntrantId : record.homeEntrantId,
            }),
      });
      changed = true;
    }
  }

  // Duplicate side pairs or a fixture claimed by multiple generated nodes make
  // the graph-to-record mapping unsafe; callers preserve unresolved behavior.
  const mappedRecords = [...reconstructed.values()].flatMap((entry) =>
    entry.record === undefined ? [] : [entry.record.fixtureId],
  );
  if (new Set(mappedRecords).size !== mappedRecords.length) return undefined;

  return reconstructed;
}

function resolveSlot(
  slot: SlotSource,
  reconstructed: ReadonlyMap<string, ReconstructedMatch>,
  graphMatches: ReadonlyMap<string, { readonly id: string }>,
): ResolvedSlot | undefined {
  if (slot.kind === 'entrant') return { kind: 'entrant', entrantId: slot.entrantId };
  if (slot.kind === 'bye') return slot;
  if (slot.kind !== 'winner-of' && slot.kind !== 'loser-of') return undefined;
  if (!graphMatches.has(slot.matchId)) return undefined;

  const parent = reconstructed.get(slot.matchId);
  if (!parent) return undefined;
  const entrantId = slot.kind === 'winner-of' ? parent.winnerEntrantId : parent.loserEntrantId;
  if (entrantId !== undefined) return { kind: 'entrant', entrantId };
  if (parent.winnerEntrantId !== undefined && parent.entrants[1] === undefined) {
    return { kind: 'bye' };
  }
  return undefined;
}

function doubleEliminationChampion(
  graph: FixtureGraph,
  reconstructed: ReadonlyMap<string, ReconstructedMatch>,
): ChampionshipFixture | undefined {
  const grandFinals = graph.matches
    .filter(isDuelMatch)
    .filter((match) => match.bracket === 'grand-final')
    .sort((a, b) => a.round - b.round || a.position - b.position);
  const firstFinal = grandFinals[0];
  if (!firstFinal) return undefined;

  const firstResolution = reconstructed.get(firstFinal.id);
  if (!firstResolution?.record || !firstResolution.winnerEntrantId) return undefined;

  // The winners-bracket champion is slot A in the generated grand final. If
  // slot B wins, the graph's conditional reset is required to decide champion.
  if (firstResolution.winnerEntrantId !== firstResolution.entrants[0]) {
    const reset = grandFinals.find((match) => match.conditional === 'bracket-reset');
    if (!reset) return undefined;
    return championshipFixtureOf(reset.id, reconstructed);
  }

  return championshipFixtureOf(firstFinal.id, reconstructed);
}

function championshipFixtureOf(
  matchId: string | undefined,
  reconstructed: ReadonlyMap<string, ReconstructedMatch>,
): ChampionshipFixture | undefined {
  if (matchId === undefined) return undefined;
  const match = reconstructed.get(matchId);
  if (!match?.record || match.winnerEntrantId === undefined || match.loserEntrantId === undefined) {
    return undefined;
  }
  return {
    fixture: match.record,
    winnerEntrantId: match.winnerEntrantId,
    loserEntrantId: match.loserEntrantId,
  };
}

function samePair(left: readonly [string, string], right: readonly [string, string]): boolean {
  return (
    (left[0] === right[0] && left[1] === right[1]) || (left[0] === right[1] && left[1] === right[0])
  );
}
