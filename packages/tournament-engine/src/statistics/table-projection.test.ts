import { footballDescriptor, findTableLayout, type TableLayoutDefinition } from '@copalibre/domain';
import { validateExpression } from '@copalibre/rules';
import { projectTableLayout, type TableProjectionActor } from './table-projection.js';
import type { CollectedFigure } from './fold.js';

/**
 * A projection is only as trustworthy as the figures and layout it is handed,
 * so every case below builds both explicitly rather than through a fixture
 * that could hide what a column actually reads.
 */

function figure(
  actorId: string,
  collectorCode: string,
  value: number,
  samples = 1,
): CollectedFigure {
  return {
    collectorCode,
    actorGranularity: 'team',
    actorId,
    competitionGranularity: 'stage',
    competitionId: 'st-1',
    value,
    samples,
  };
}

const GROUP_STANDINGS: TableLayoutDefinition = {
  code: 'group-standings-default',
  target: 'group-phase',
  label: { en: 'Group Standings' },
  entityGranularity: 'team',
  defaultSort: [
    { columnCode: 'points', direction: 'desc' },
    { columnCode: 'gd', direction: 'desc' },
  ],
  columns: [
    { code: 'rank', header: { en: 'Pos' }, source: { kind: 'rank' }, format: 'number' },
    { code: 'name', header: { en: 'Team' }, source: { kind: 'entrant-name' }, format: 'text' },
    {
      code: 'gf',
      header: { en: 'GF' },
      source: { kind: 'collector', code: 'goals-for' },
      format: 'number',
    },
    {
      code: 'ga',
      header: { en: 'GA' },
      source: { kind: 'collector', code: 'goals-against' },
      format: 'number',
    },
    {
      code: 'gd',
      header: { en: 'GD' },
      source: { kind: 'computed', expression: 'gf - ga' },
      format: 'number',
    },
    {
      code: 'points',
      header: { en: 'Pts' },
      source: { kind: 'collector', code: 'points' },
      format: 'number',
    },
  ],
};

function team(actorId: string, name: string): TableProjectionActor {
  return { actorId, name };
}

describe('projectTableLayout', () => {
  it('computes a ratio via the real expression evaluator (goals / max(played, 1))', () => {
    const layout: TableLayoutDefinition = {
      code: 'top-scorers',
      target: 'player-ranking',
      label: { en: 'Top Scorers' },
      entityGranularity: 'team',
      defaultSort: [{ columnCode: 'goals', direction: 'desc' }],
      columns: [
        {
          code: 'goals',
          header: { en: 'Goals' },
          source: { kind: 'collector', code: 'player-goals' },
          format: 'number',
        },
        {
          code: 'played',
          header: { en: 'Matches' },
          source: { kind: 'collector', code: 'player-appearances' },
          format: 'number',
        },
        {
          code: 'goals-per-match',
          header: { en: 'Goals/M' },
          source: { kind: 'computed', expression: 'goals / max(played, 1)' },
          format: 'decimal-2',
        },
      ],
    };
    const figures = [
      figure('a-1', 'player-goals', 5),
      figure('a-1', 'player-appearances', 2),
      // Zero recorded appearances — max(played, 1) is what keeps this a real
      // number instead of a division by zero.
      figure('a-2', 'player-goals', 1),
      figure('a-2', 'player-appearances', 0),
    ];

    const projection = projectTableLayout(figures, layout, {
      actors: [team('a-1', 'Alice'), team('a-2', 'Bob')],
    });

    expect(projection.rows[0]?.cells['goals-per-match']).toEqual({ raw: 2.5, formatted: '2.50' });
    expect(projection.rows[1]?.cells['goals-per-match']).toEqual({ raw: 1, formatted: '1.00' });
  });

  it('formats a composite column as a fraction and carries numerator/denominator', () => {
    const layout: TableLayoutDefinition = {
      code: 'penalties',
      target: 'player-ranking',
      label: { en: 'Penalties' },
      entityGranularity: 'team',
      defaultSort: [{ columnCode: 'penalties', direction: 'desc' }],
      columns: [
        {
          code: 'penalties',
          header: { en: 'Penalties' },
          source: {
            kind: 'composite',
            numerator: 'penalties-scored',
            denominator: 'penalties-taken',
          },
          format: 'fraction',
        },
      ],
    };
    const figures = [figure('a-1', 'penalties-scored', 4), figure('a-1', 'penalties-taken', 5)];

    const projection = projectTableLayout(figures, layout, { actors: [team('a-1', 'Alice')] });

    expect(projection.rows[0]?.cells['penalties']).toEqual({
      raw: 0.8,
      formatted: '4/5',
      numerator: 4,
      denominator: 5,
    });
  });

  it('formats a composite column as 0/0 without throwing when neither side was recorded', () => {
    const layout: TableLayoutDefinition = {
      ...GROUP_STANDINGS,
      columns: [
        {
          code: 'penalties',
          header: { en: 'Penalties' },
          source: {
            kind: 'composite',
            numerator: 'penalties-scored',
            denominator: 'penalties-taken',
          },
          format: 'fraction',
        },
      ],
      defaultSort: [],
    };

    const projection = projectTableLayout([], layout, { actors: [team('a-1', 'Alice')] });

    expect(projection.rows[0]?.cells['penalties']).toEqual({
      raw: undefined,
      formatted: '0/0',
      numerator: 0,
      denominator: 0,
    });
  });

  it('resolves computed columns against prior column codes and assigns ranks with multi-column sort', () => {
    const figures = [
      figure('tm-a', 'goals-for', 4),
      figure('tm-a', 'goals-against', 2),
      figure('tm-a', 'points', 6),
      figure('tm-b', 'goals-for', 2),
      figure('tm-b', 'goals-against', 1),
      figure('tm-b', 'points', 6),
      figure('tm-c', 'goals-for', 1),
      figure('tm-c', 'goals-against', 5),
      figure('tm-c', 'points', 3),
    ];

    const projection = projectTableLayout(figures, GROUP_STANDINGS, {
      actors: [team('tm-a', 'Atlas'), team('tm-b', 'Boca'), team('tm-c', 'Colo')],
    });

    // Both tm-a and tm-b have 6 points; tm-a's GD (+2) beats tm-b's GD (+1).
    expect(projection.rows.map((row) => row.actorId)).toEqual(['tm-a', 'tm-b', 'tm-c']);
    expect(projection.rows[0]?.cells['gd']).toEqual({ raw: 2, formatted: '2' });
    expect(projection.rows.map((row) => row.rank)).toEqual([1, 2, 3]);
    expect(projection.rows.every((row) => !row.sharedRank)).toBe(true);
    expect(projection.rows[0]?.cells['rank']).toEqual({ raw: 1, formatted: '1' });
  });

  it('gives tied rows the same rank when every sort column matches', () => {
    const figures = [
      figure('tm-a', 'goals-for', 3),
      figure('tm-a', 'goals-against', 1),
      figure('tm-a', 'points', 6),
      figure('tm-b', 'goals-for', 3),
      figure('tm-b', 'goals-against', 1),
      figure('tm-b', 'points', 6),
    ];

    const projection = projectTableLayout(figures, GROUP_STANDINGS, {
      actors: [team('tm-a', 'Atlas'), team('tm-b', 'Boca')],
    });

    expect(projection.rows.map((row) => row.rank)).toEqual([1, 1]);
    expect(projection.rows.every((row) => row.sharedRank)).toBe(true);
  });

  it('applies requiresRole and minSamples qualification filters', () => {
    const layout: TableLayoutDefinition = {
      code: 'goalkeeper-zamora',
      target: 'player-ranking',
      label: { en: 'Zamora' },
      entityGranularity: 'team',
      filter: {
        requiresRole: 'goalkeeper',
        minSamples: { collectorCode: 'player-appearances', min: 3 },
      },
      defaultSort: [{ columnCode: 'conceded', direction: 'asc' }],
      columns: [
        {
          code: 'conceded',
          header: { en: 'Conceded' },
          source: { kind: 'collector', code: 'goalkeeper-goals-conceded' },
          format: 'number',
        },
      ],
    };
    const figures = [
      figure('gk-qualified', 'goalkeeper-goals-conceded', 4, 1),
      figure('gk-qualified', 'player-appearances', 5, 5),
      figure('gk-too-few', 'goalkeeper-goals-conceded', 1, 1),
      figure('gk-too-few', 'player-appearances', 2, 2),
    ];
    const actors: readonly TableProjectionActor[] = [
      { actorId: 'gk-qualified', name: 'Qualified GK', roles: ['goalkeeper'] },
      { actorId: 'gk-too-few', name: 'Too Few Matches GK', roles: ['goalkeeper'] },
      { actorId: 'not-a-gk', name: 'Outfield Player', roles: ['defender'] },
    ];

    const projection = projectTableLayout(figures, layout, { actors });

    expect(projection.rows.map((row) => row.actorId)).toEqual(['gk-qualified']);
  });

  it('refuses a ternary at validation time — a table column expression must not branch', () => {
    const result = validateExpression('played > 0 ? played : 1');

    expect(result.ok).toBe(false);
  });

  it('projects football top-scorers layout directly with cross-stage person figures', () => {
    const descriptor = footballDescriptor();
    const topScorers = findTableLayout(descriptor, 'top-scorers');
    expect(topScorers).toBeDefined();
    if (!topScorers) return;

    const tournamentFigures: CollectedFigure[] = [
      {
        collectorCode: 'goals-for',
        actorGranularity: 'person',
        actorId: 'p-1',
        competitionGranularity: 'tournament',
        competitionId: 'tr-1',
        value: 7,
        samples: 4,
      },
      {
        collectorCode: 'goals-for',
        actorGranularity: 'person',
        actorId: 'p-2',
        competitionGranularity: 'tournament',
        competitionId: 'tr-1',
        value: 5,
        samples: 2,
      },
      {
        collectorCode: 'goals-for',
        actorGranularity: 'person',
        actorId: 'p-3',
        competitionGranularity: 'tournament',
        competitionId: 'tr-1',
        value: 2,
        samples: 1,
      },
    ];

    const actors: readonly TableProjectionActor[] = [
      { actorId: 'p-1', name: 'Alice Striker', teamName: 'Atlas FC', entrantId: 'en-atlas' },
      { actorId: 'p-2', name: 'Bob Forward', teamName: 'Boca Juniors', entrantId: 'en-boca' },
      { actorId: 'p-3', name: 'Charlie Winger', teamName: 'Colo Colo', entrantId: 'en-colo' },
    ];

    const projection = projectTableLayout(tournamentFigures, topScorers, { actors });

    expect(projection.rows.map((row) => row.actorId)).toEqual(['p-1', 'p-2', 'p-3']);
    expect(projection.rows.map((row) => row.rank)).toEqual([1, 2, 3]);
    expect(projection.rows[0]?.cells['goals']).toEqual({ raw: 7, formatted: '7' });
    expect(projection.rows[1]?.cells['goals']).toEqual({ raw: 5, formatted: '5' });
    expect(projection.rows[2]?.cells['goals']).toEqual({ raw: 2, formatted: '2' });
    expect(projection.rows[0]?.entrantId).toBe('en-atlas');
  });

  it('projects football cards layout sorting first by red cards then yellow cards', () => {
    const descriptor = footballDescriptor();
    const cardsLayout = findTableLayout(descriptor, 'cards');
    expect(cardsLayout).toBeDefined();
    if (!cardsLayout) return;

    const figures: CollectedFigure[] = [
      {
        collectorCode: 'red-cards',
        actorGranularity: 'person',
        actorId: 'p-1',
        competitionGranularity: 'tournament',
        competitionId: 'tr-1',
        value: 1,
        samples: 3,
      },
      {
        collectorCode: 'yellow-cards',
        actorGranularity: 'person',
        actorId: 'p-1',
        competitionGranularity: 'tournament',
        competitionId: 'tr-1',
        value: 2,
        samples: 3,
      },
      {
        collectorCode: 'red-cards',
        actorGranularity: 'person',
        actorId: 'p-2',
        competitionGranularity: 'tournament',
        competitionId: 'tr-1',
        value: 2,
        samples: 3,
      },
      {
        collectorCode: 'yellow-cards',
        actorGranularity: 'person',
        actorId: 'p-2',
        competitionGranularity: 'tournament',
        competitionId: 'tr-1',
        value: 1,
        samples: 3,
      },
      {
        collectorCode: 'red-cards',
        actorGranularity: 'person',
        actorId: 'p-3',
        competitionGranularity: 'tournament',
        competitionId: 'tr-1',
        value: 1,
        samples: 3,
      },
      {
        collectorCode: 'yellow-cards',
        actorGranularity: 'person',
        actorId: 'p-3',
        competitionGranularity: 'tournament',
        competitionId: 'tr-1',
        value: 4,
        samples: 3,
      },
    ];

    const actors: readonly TableProjectionActor[] = [
      { actorId: 'p-1', name: 'Player 1' },
      { actorId: 'p-2', name: 'Player 2' },
      { actorId: 'p-3', name: 'Player 3' },
    ];

    const projection = projectTableLayout(figures, cardsLayout, { actors });

    // p-2 (2 RC) > p-3 (1 RC, 4 YC) > p-1 (1 RC, 2 YC)
    expect(projection.rows.map((row) => row.actorId)).toEqual(['p-2', 'p-3', 'p-1']);
    expect(projection.rows[0]?.cells['red-cards']).toEqual({ raw: 2, formatted: '2' });
    expect(projection.rows[1]?.cells['yellow-cards']).toEqual({ raw: 4, formatted: '4' });
  });
});
