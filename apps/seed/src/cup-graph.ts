import type { DemoGame } from '@copalibre/demo-datasets';
import type { FixtureGraphSlotSource, PersistedFixtureNode } from '@copalibre/persistence';
import { placementRole } from './placement-role.js';

/** A dataset cup the loader cannot express as a bracket: a side with no game it came from. */
export class CupGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CupGraphError';
  }
}

/** One cup as a persisted bracket, inferred from where each entrant actually played. */
export interface InferredCup {
  readonly nodeKeyByGame: ReadonlyMap<string, string>;
  /**
   * The team aliases seated in the first round, in node order: home then away of `SE-R1-M1`, then of
   * `SE-R1-M2`, and so on. Seat `k` (1-based) is the cup's `k`-th qualifier position.
   */
  readonly seats: readonly string[];
  /** The winner of each drawn game that fed a later one: whoever played on, by game key. */
  readonly drawWinners: ReadonlyMap<string, string>;
  /** The bracket's nodes, with each first-round side the qualifier `seat` names. */
  nodes(qualifier: (seat: number) => FixtureGraphSlotSource): readonly PersistedFixtureNode[];
}

interface Edge {
  readonly kind: 'winner-of' | 'loser-of';
  readonly feeder: DemoGame;
}

/**
 * The engine's single-elimination shape for a cup with every place played, built from the dataset:
 *
 * - main-bracket games are `SE-R{depth}-M{position}`; positions descend from the final, a game's
 *   home side coming from position `2p - 1` of the round below and its away side from `2p`;
 * - a `5º al 8º puesto` round is `PL5-R1-M{n}`, ordered by the games feeding it;
 * - a `3º puesto` game is `placement-3`, and so on.
 *
 * Each later side is an edge to the earlier game of the same cup its entrant last played. Its kind
 * follows the game's place in the bracket: a main-bracket game takes winners; a placement game fed
 * by the main bracket takes losers; a placement game fed by a places range takes that range's
 * winners when it plays for the range's top place, else its losers. Every edge is checked against
 * the score, and a drawn game's winner is read from the edge that leaves it as a winner.
 */
export function inferCupGraph(games: readonly DemoGame[]): InferredCup {
  const ordered = [...games].sort(
    (a, b) =>
      a.roundNumber - b.roundNumber ||
      a.scheduledAt.localeCompare(b.scheduledAt) ||
      a.key.localeCompare(b.key, 'en', { numeric: true }),
  );
  const isMain = (game: DemoGame) => placementRole(game.round) === undefined;
  const main = ordered.filter(isMain);
  if (main.length === 0) throw new CupGraphError('A cup has no main-bracket game');
  const firstDepth = Math.min(...main.map((game) => game.roundNumber));

  /** The game of this cup a side's entrant came from: the latest one it played in an earlier round. */
  const feederOf = (game: DemoGame, team: string): DemoGame | undefined =>
    ordered
      .filter(
        (candidate) =>
          candidate.roundNumber < game.roundNumber &&
          (candidate.homeTeamAlias === team || candidate.awayTeamAlias === team),
      )
      .at(-1);

  // Main-bracket positions descend from the deepest round, which is normally the final alone.
  const position = new Map<string, number>();
  const deepest = Math.max(...main.map((game) => game.roundNumber));
  const place = (game: DemoGame, at: number): void => {
    position.set(game.key, at);
    if (game.roundNumber === firstDepth) return;
    for (const [index, team] of [game.homeTeamAlias, game.awayTeamAlias].entries()) {
      const feeder = feederOf(game, team);
      if (!feeder || !isMain(feeder) || feeder.roundNumber !== game.roundNumber - 1) {
        throw new CupGraphError(`${game.key}: ${team} did not come from the round before`);
      }
      place(feeder, 2 * at - 1 + index);
    }
  };
  main
    .filter((game) => game.roundNumber === deepest)
    .sort((a, b) => a.key.localeCompare(b.key, 'en', { numeric: true }))
    .forEach((root, index) => place(root, index + 1));
  const unplaced = main.find((game) => !position.has(game.key));
  if (unplaced) throw new CupGraphError(`${unplaced.key} feeds no later main-bracket game`);

  const nodeKeyByGame = new Map<string, string>();
  for (const game of main) {
    nodeKeyByGame.set(game.key, `SE-R${game.roundNumber}-M${position.get(game.key)}`);
  }

  const edgesOf = new Map<string, readonly [Edge, Edge]>();
  const edge = (game: DemoGame, team: string): Edge => {
    const feeder = feederOf(game, team);
    if (!feeder) throw new CupGraphError(`${game.key}: ${team} came from no earlier game`);
    const role = placementRole(game.round);
    if (role === undefined) return { kind: 'winner-of', feeder };
    const feederRange = /^places-(\d+)-\d+$/.exec(placementRole(feeder.round) ?? '');
    if (feederRange === null) return { kind: 'loser-of', feeder };
    const top = /^places?-(\d+)/.exec(role)?.[1];
    return { kind: top === feederRange[1] ? 'winner-of' : 'loser-of', feeder };
  };
  for (const game of ordered) {
    if (isMain(game) && game.roundNumber === firstDepth) continue;
    edgesOf.set(game.key, [edge(game, game.homeTeamAlias), edge(game, game.awayTeamAlias)]);
  }

  // Placement nodes are keyed by what they settle; a range round is ordered by its feeders.
  const feederRank = (game: DemoGame) =>
    Math.min(
      ...(edgesOf.get(game.key) ?? []).map((entry) => position.get(entry.feeder.key) ?? Infinity),
    );
  const ranges = new Map<string, DemoGame[]>();
  for (const game of ordered.filter((candidate) => !isMain(candidate))) {
    const role = placementRole(game.round) as string;
    const range = /^places-(\d+)-\d+$/.exec(role);
    if (range === null) {
      nodeKeyByGame.set(game.key, `placement-${/\d+/.exec(role)?.[0] ?? ''}`);
      continue;
    }
    ranges.set(range[1] as string, [...(ranges.get(range[1] as string) ?? []), game]);
  }
  for (const [top, rangeGames] of ranges) {
    [...rangeGames]
      .sort((a, b) => feederRank(a) - feederRank(b))
      .forEach((game, index) => {
        nodeKeyByGame.set(game.key, `PL${top}-R1-M${index + 1}`);
        position.set(game.key, index + 1);
      });
  }

  const drawWinners = new Map<string, string>();
  for (const game of ordered) {
    const edges = edgesOf.get(game.key);
    if (!edges) continue;
    for (const [index, entry] of edges.entries()) {
      const team = index === 0 ? game.homeTeamAlias : game.awayTeamAlias;
      const { feeder } = entry;
      const drawn = feeder.homeGoals === feeder.awayGoals;
      const winner = drawn
        ? undefined
        : feeder.homeGoals > feeder.awayGoals
          ? feeder.homeTeamAlias
          : feeder.awayTeamAlias;
      const asWinner = entry.kind === 'winner-of';
      if (drawn) {
        const other = feeder.homeTeamAlias === team ? feeder.awayTeamAlias : feeder.homeTeamAlias;
        const decided = asWinner ? team : other;
        const known = drawWinners.get(feeder.key);
        if (known !== undefined && known !== decided) {
          throw new CupGraphError(`${feeder.key} was drawn and both entrants played on as winners`);
        }
        drawWinners.set(feeder.key, decided);
      } else if ((winner === team) !== asWinner) {
        throw new CupGraphError(
          `${game.key}: ${team} is the ${asWinner ? 'winner' : 'loser'} of ${feeder.key} by its place, ` +
            'but the score says otherwise',
        );
      }
    }
  }

  const firstRound = main
    .filter((game) => game.roundNumber === firstDepth)
    .sort((a, b) => (position.get(a.key) ?? 0) - (position.get(b.key) ?? 0));
  const seats = firstRound.flatMap((game) => [game.homeTeamAlias, game.awayTeamAlias]);

  return {
    nodeKeyByGame,
    seats,
    drawWinners,
    nodes: (qualifier) =>
      ordered.map((game): PersistedFixtureNode => {
        const nodeKey = nodeKeyByGame.get(game.key) as string;
        const placement = !isMain(game);
        const edges = edgesOf.get(game.key);
        const seat = (side: 0 | 1) => 2 * ((position.get(game.key) ?? 1) - 1) + side + 1;
        const sides: readonly [FixtureGraphSlotSource, FixtureGraphSlotSource] =
          edges === undefined
            ? [qualifier(seat(0)), qualifier(seat(1))]
            : [
                { kind: edges[0].kind, matchId: nodeKeyByGame.get(edges[0].feeder.key) as string },
                { kind: edges[1].kind, matchId: nodeKeyByGame.get(edges[1].feeder.key) as string },
              ];
        const fedByPlacement = (edges ?? []).some((entry) => !isMain(entry.feeder));
        return {
          nodeKey,
          bracket: placement ? 'placement' : 'winners',
          round: placement ? (fedByPlacement ? 2 : 1) : game.roundNumber,
          position: placement && !nodeKey.startsWith('PL') ? 1 : (position.get(game.key) ?? 1),
          ...(placement
            ? {
                branch: nodeKey.startsWith('PL')
                  ? (nodeKey.split('-')[0] ?? nodeKey).toLowerCase()
                  : nodeKey,
              }
            : {}),
          sides,
          seriesSpan: 1,
        };
      }),
  };
}
