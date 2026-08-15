import type { MatchRoster } from '../aggregates/competition.js';
import type { RecordedEvent } from './event-log.js';
import { foldRosterLineup, soleMemberWithRole } from './roster-lineup.js';

function substitution(
  sequence: number,
  side: string,
  playerOutId: string,
  playerInId: string,
): RecordedEvent {
  return {
    eventId: `sub-${sequence}`,
    matchId: 'match-1',
    segmentId: 'segment-1',
    definitionCode: 'substitution',
    occurredAt: '2026-08-15T20:00:00.000Z',
    sequence,
    side,
    payload: { playerOutId, playerInId },
  };
}

const ROSTER: MatchRoster = {
  matchId: 'match-1',
  entrantId: 'entrant-a',
  members: [
    { personId: 'starter-gk', name: 'Starter GK', roles: ['goalkeeper'], onField: true },
    { personId: 'bench-gk', name: 'Bench GK', roles: ['goalkeeper'], onField: false },
    { personId: 'starter-1', name: 'Starter One', onField: true },
    { personId: 'sub-1', name: 'Substitute One', onField: false },
  ],
};

describe('foldRosterLineup', () => {
  it('leaves onField unchanged with no substitution events', () => {
    const folded = foldRosterLineup(ROSTER, []);
    expect(folded).toEqual(ROSTER);
  });

  it('flips onField for the player out and the player in', () => {
    const folded = foldRosterLineup(ROSTER, [substitution(1, 'entrant-a', 'starter-1', 'sub-1')]);

    expect(folded.members.find((m) => m.personId === 'starter-1')?.onField).toBe(false);
    expect(folded.members.find((m) => m.personId === 'sub-1')?.onField).toBe(true);
    // Untouched members keep their starting state.
    expect(folded.members.find((m) => m.personId === 'starter-gk')?.onField).toBe(true);
  });

  it('applies several substitutions in sequence order', () => {
    const folded = foldRosterLineup(ROSTER, [
      substitution(1, 'entrant-a', 'starter-gk', 'bench-gk'),
      substitution(2, 'entrant-a', 'starter-1', 'sub-1'),
    ]);

    expect(folded.members.find((m) => m.personId === 'starter-gk')?.onField).toBe(false);
    expect(folded.members.find((m) => m.personId === 'bench-gk')?.onField).toBe(true);
    expect(folded.members.find((m) => m.personId === 'sub-1')?.onField).toBe(true);
  });

  it('a later event wins when a player is subbed back in after being subbed out', () => {
    const folded = foldRosterLineup(ROSTER, [
      substitution(1, 'entrant-a', 'starter-1', 'sub-1'),
      substitution(2, 'entrant-a', 'sub-1', 'starter-1'),
    ]);

    expect(folded.members.find((m) => m.personId === 'starter-1')?.onField).toBe(true);
    expect(folded.members.find((m) => m.personId === 'sub-1')?.onField).toBe(false);
  });

  it('ignores a substitution recorded for a different entrant', () => {
    const folded = foldRosterLineup(ROSTER, [substitution(1, 'entrant-b', 'starter-1', 'sub-1')]);
    expect(folded).toEqual(ROSTER);
  });

  it('ignores a non-substitution event', () => {
    const folded = foldRosterLineup(ROSTER, [
      {
        eventId: 'e-1',
        matchId: 'match-1',
        segmentId: 'segment-1',
        definitionCode: 'goal',
        occurredAt: '2026-08-15T20:00:00.000Z',
        sequence: 1,
        side: 'entrant-a',
        personId: 'starter-1',
        payload: {},
      },
    ]);
    expect(folded).toEqual(ROSTER);
  });
});

describe('soleMemberWithRole', () => {
  it('finds the on-field member carrying the named role', () => {
    expect(soleMemberWithRole(ROSTER, 'goalkeeper')).toBe('starter-gk');
  });

  it('follows a substitution', () => {
    const folded = foldRosterLineup(ROSTER, [
      substitution(1, 'entrant-a', 'starter-gk', 'bench-gk'),
    ]);
    expect(soleMemberWithRole(folded, 'goalkeeper')).toBe('bench-gk');
  });

  it('returns undefined when no on-field member carries the role', () => {
    const noGoalkeeper: MatchRoster = {
      ...ROSTER,
      members: ROSTER.members.map((member) => ({ ...member, roles: undefined })),
    };
    expect(soleMemberWithRole(noGoalkeeper, 'goalkeeper')).toBeUndefined();
  });

  it('does not return a benched member carrying the role', () => {
    expect(soleMemberWithRole(ROSTER, 'goalkeeper')).not.toBe('bench-gk');
  });

  it('returns undefined when more than one on-field member carries the role', () => {
    const twoGoalkeepers: MatchRoster = {
      ...ROSTER,
      members: ROSTER.members.map((member) =>
        member.personId === 'bench-gk' ? { ...member, onField: true } : member,
      ),
    };
    expect(soleMemberWithRole(twoGoalkeepers, 'goalkeeper')).toBeUndefined();
  });

  it('resolves an arbitrary discipline-declared role code, not only "goalkeeper"', () => {
    const withCaptain: MatchRoster = {
      ...ROSTER,
      members: ROSTER.members.map((member) =>
        member.personId === 'starter-1' ? { ...member, roles: ['captain'] } : member,
      ),
    };
    expect(soleMemberWithRole(withCaptain, 'captain')).toBe('starter-1');
  });
});
