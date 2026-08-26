import {
  canTransitionTournament,
  hasStarted,
  transitionTournament,
  type TournamentStatus,
} from './tournament.js';

const ALL_STATES: readonly TournamentStatus[] = [
  'draft',
  'published',
  'started',
  'finished',
  'archived',
];

describe('canTransitionTournament', () => {
  it.each([
    ['draft', 'published'],
    ['published', 'started'],
    ['started', 'finished'],
    ['finished', 'archived'],
  ] as const)('allows %s -> %s', (from, to) => {
    expect(canTransitionTournament(from, to)).toBe(true);
  });

  it('refuses every pair not on the linear path plus terminal archival', () => {
    const legal = new Set([
      'draft->published',
      'published->started',
      'started->finished',
      'finished->archived',
    ]);
    for (const from of ALL_STATES) {
      for (const to of ALL_STATES) {
        const expected = legal.has(`${from}->${to}`);
        expect(canTransitionTournament(from, to)).toBe(expected);
      }
    }
  });

  it('refuses archiving a tournament that is not finished', () => {
    for (const from of ['draft', 'published', 'started'] as const) {
      expect(canTransitionTournament(from, 'archived')).toBe(false);
    }
  });

  it('has no transitions out of archived', () => {
    for (const to of ALL_STATES) {
      expect(canTransitionTournament('archived', to)).toBe(false);
    }
  });
});

describe('transitionTournament', () => {
  it('resolves ok for a legal transition', () => {
    const result = transitionTournament('finished', 'archived');
    expect(result).toEqual({ ok: true, value: 'archived' });
  });

  it('resolves err with the illegal pair named, for an illegal transition', () => {
    const result = transitionTournament('started', 'archived');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('started');
      expect(result.error.message).toContain('archived');
    }
  });
});

describe('hasStarted', () => {
  it.each(['started', 'finished', 'archived'] as const)('is true once %s', (status) => {
    expect(hasStarted({ status } as never)).toBe(true);
  });

  it.each(['draft', 'published'] as const)('is false while %s', (status) => {
    expect(hasStarted({ status } as never)).toBe(false);
  });
});
