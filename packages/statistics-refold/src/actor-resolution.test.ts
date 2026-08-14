import { resolveMatchRoster } from './actor-resolution.js';

describe('resolving a match roster from raw rows (0082)', () => {
  it('resolves a team-kind entrant’s roster member from the players row for that team', () => {
    const { roster } = resolveMatchRoster({
      rosterRows: [{ entrantId: 'en-atlas', personIds: ['pe-1'] }],
      entrants: [{ entrantId: 'en-atlas', kind: 'team', personId: null, teamId: 'tm-atlas' }],
      players: [{ personId: 'pe-1', playerId: 'pl-1', teamId: 'tm-atlas', role: 'player' }],
      clubOfTeam: new Map([['tm-atlas', 'cl-atlas']]),
    });

    expect(roster).toEqual([
      {
        personId: 'pe-1',
        playerId: 'pl-1',
        teamId: 'tm-atlas',
        clubId: 'cl-atlas',
        role: 'player',
      },
    ]);
  });

  it('defaults role to "player" for a team roster member with no players row', () => {
    const { roster } = resolveMatchRoster({
      rosterRows: [{ entrantId: 'en-atlas', personIds: ['pe-called-up'] }],
      entrants: [{ entrantId: 'en-atlas', kind: 'team', personId: null, teamId: 'tm-atlas' }],
      players: [],
      clubOfTeam: new Map(),
    });

    expect(roster).toEqual([{ personId: 'pe-called-up', teamId: 'tm-atlas', role: 'player' }]);
  });

  it('resolves an individual-sport entrant as the person, with no team/club/player id', () => {
    const { roster } = resolveMatchRoster({
      rosterRows: [{ entrantId: 'en-solo', personIds: ['pe-solo'] }],
      entrants: [{ entrantId: 'en-solo', kind: 'person', personId: 'pe-solo', teamId: null }],
      players: [],
      clubOfTeam: new Map(),
    });

    expect(roster).toEqual([{ personId: 'pe-solo', role: 'player' }]);
  });

  it('skips a roster row whose entrant cannot be resolved', () => {
    const { roster } = resolveMatchRoster({
      rosterRows: [{ entrantId: 'en-ghost', personIds: ['pe-1'] }],
      entrants: [],
      players: [],
      clubOfTeam: new Map(),
    });

    expect(roster).toEqual([]);
  });

  it('does not cross a person into a team it does not play for, in a two-team match', () => {
    const { roster } = resolveMatchRoster({
      rosterRows: [
        { entrantId: 'en-atlas', personIds: ['pe-1'] },
        { entrantId: 'en-boca', personIds: ['pe-2'] },
      ],
      entrants: [
        { entrantId: 'en-atlas', kind: 'team', personId: null, teamId: 'tm-atlas' },
        { entrantId: 'en-boca', kind: 'team', personId: null, teamId: 'tm-boca' },
      ],
      // Same person id declared for both teams' rosters in the fixture data
      // (a scrimmage / trial roster) — the (teamId, personId) key must keep
      // them apart rather than matching whichever comes first.
      players: [
        { personId: 'pe-1', playerId: 'pl-1-atlas', teamId: 'tm-atlas', role: 'player' },
        { personId: 'pe-2', playerId: 'pl-2-boca', teamId: 'tm-boca', role: 'coach' },
      ],
      clubOfTeam: new Map([
        ['tm-atlas', 'cl-atlas'],
        ['tm-boca', 'cl-boca'],
      ]),
    });

    expect(roster).toEqual([
      {
        personId: 'pe-1',
        playerId: 'pl-1-atlas',
        teamId: 'tm-atlas',
        clubId: 'cl-atlas',
        role: 'player',
      },
      {
        personId: 'pe-2',
        playerId: 'pl-2-boca',
        teamId: 'tm-boca',
        clubId: 'cl-boca',
        role: 'coach',
      },
    ]);
  });

  describe('actorOf', () => {
    it('resolves a team-kind entrant to its team/club, with a sentinel person', () => {
      const { actorOf } = resolveMatchRoster({
        rosterRows: [],
        entrants: [{ entrantId: 'en-atlas', kind: 'team', personId: null, teamId: 'tm-atlas' }],
        players: [],
        clubOfTeam: new Map([['tm-atlas', 'cl-atlas']]),
      });

      expect(actorOf('en-atlas')).toEqual({ personId: '', teamId: 'tm-atlas', clubId: 'cl-atlas' });
    });

    it('resolves a team-kind entrant with no club without inventing one', () => {
      const { actorOf } = resolveMatchRoster({
        rosterRows: [],
        entrants: [{ entrantId: 'en-atlas', kind: 'team', personId: null, teamId: 'tm-atlas' }],
        players: [],
        clubOfTeam: new Map(),
      });

      expect(actorOf('en-atlas')).toEqual({ personId: '', teamId: 'tm-atlas' });
    });

    it('resolves an individual entrant straight to its person, with no team fields', () => {
      const { actorOf } = resolveMatchRoster({
        rosterRows: [],
        entrants: [{ entrantId: 'en-solo', kind: 'person', personId: 'pe-solo', teamId: null }],
        players: [],
        clubOfTeam: new Map(),
      });

      expect(actorOf('en-solo')).toEqual({ personId: 'pe-solo' });
    });

    it('resolves an unknown entrant to undefined', () => {
      const { actorOf } = resolveMatchRoster({
        rosterRows: [],
        entrants: [],
        players: [],
        clubOfTeam: new Map(),
      });

      expect(actorOf('en-ghost')).toBeUndefined();
    });
  });
});
