import type { StoredFigure } from '@copalibre/persistence';
import { readRolledUp } from './rollup.js';

function figure(overrides: Partial<StoredFigure> = {}): StoredFigure {
  return {
    collectorCode: 'goals',
    actorGranularity: 'person',
    actorId: 'pe-1',
    competitionGranularity: 'organization',
    competitionId: 'org-1',
    value: 1,
    samples: 1,
    ...overrides,
  };
}

describe('rolling a read up above a collector’s stored grain', () => {
  it('resolves a person’s total at team grain, via real membership', () => {
    const totals = readRolledUp(
      [
        figure({ actorId: 'pe-1', value: 2, samples: 2 }),
        figure({ actorId: 'pe-2', value: 3, samples: 3 }),
      ],
      { kind: 'count' },
      { actor: 'team' },
      {
        teamOfPerson: new Map([
          ['pe-1', 'tm-atlas'],
          ['pe-2', 'tm-atlas'],
        ]),
      },
    );

    expect(totals).toEqual([{ actorId: 'tm-atlas', competitionId: 'org-1', value: 5, samples: 5 }]);
  });

  it('resolves a person’s total at club grain, through the team they play for', () => {
    const totals = readRolledUp(
      [figure({ actorId: 'pe-1', value: 4, samples: 4 })],
      { kind: 'count' },
      { actor: 'club' },
      {
        teamOfPerson: new Map([['pe-1', 'tm-atlas']]),
        clubOfTeam: new Map([['tm-atlas', 'cl-atlas']]),
      },
    );

    expect(totals).toEqual([{ actorId: 'cl-atlas', competitionId: 'org-1', value: 4, samples: 4 }]);
  });

  it('resolves a player’s total at team and club grain', () => {
    const membership = {
      teamOfPlayer: new Map([['pl-1', 'tm-atlas']]),
      clubOfTeam: new Map([['tm-atlas', 'cl-atlas']]),
    };

    const toTeam = readRolledUp(
      [figure({ actorGranularity: 'player', actorId: 'pl-1', value: 1, samples: 1 })],
      { kind: 'count' },
      { actor: 'team' },
      membership,
    );
    const toClub = readRolledUp(
      [figure({ actorGranularity: 'player', actorId: 'pl-1', value: 1, samples: 1 })],
      { kind: 'count' },
      { actor: 'club' },
      membership,
    );

    expect(toTeam[0]?.actorId).toBe('tm-atlas');
    expect(toClub[0]?.actorId).toBe('cl-atlas');
  });

  it('resolves a team’s total at club grain directly', () => {
    const totals = readRolledUp(
      [figure({ actorGranularity: 'team', actorId: 'tm-atlas', value: 6, samples: 6 })],
      { kind: 'count' },
      { actor: 'club' },
      { clubOfTeam: new Map([['tm-atlas', 'cl-atlas']]) },
    );

    expect(totals).toEqual([{ actorId: 'cl-atlas', competitionId: 'org-1', value: 6, samples: 6 }]);
  });

  it('drops a person the membership map cannot place on a team, rather than inventing one', () => {
    const totals = readRolledUp(
      [figure({ actorId: 'pe-unaffiliated' })],
      { kind: 'count' },
      { actor: 'team' },
      {},
    );

    expect(totals).toEqual([]);
  });

  it.each(['official', 'venue'] as const)(
    'refuses a coarser read for a roll-up-terminal "%s" actor, exactly as isCoarser already does',
    (actorGranularity) => {
      const totals = readRolledUp(
        [
          figure({
            actorGranularity,
            actorId: 'x-1',
            competitionGranularity: 'organization',
            competitionId: 'org-1',
          }),
        ],
        { kind: 'count' },
        { actor: 'club' },
        {
          teamOfPerson: new Map([['x-1', 'tm-atlas']]),
          clubOfTeam: new Map([['tm-atlas', 'cl-atlas']]),
        },
      );

      expect(totals).toEqual([]);
    },
  );

  it('reads at the stored grain unchanged when no coarser target is asked for', () => {
    const totals = readRolledUp([figure({ value: 7, samples: 7 })], { kind: 'count' }, {});

    expect(totals).toEqual([{ actorId: 'pe-1', competitionId: 'org-1', value: 7, samples: 7 }]);
  });
});
