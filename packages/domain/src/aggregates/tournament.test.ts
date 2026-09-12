import {
  canTransitionTournament,
  hasStarted,
  transitionTournament,
  deriveTournamentStatus,
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

describe('deriveTournamentStatus', () => {
  it('classifies finished or archived status as finished regardless of matches', () => {
    expect(deriveTournamentStatus('finished', [])).toBe('finished');
    expect(deriveTournamentStatus('archived', [])).toBe('finished');
    expect(deriveTournamentStatus('finished', [{ status: 'in-progress' }])).toBe('finished');
  });

  it('classifies a tournament as finished when all matches are finalized (task 3.1)', () => {
    expect(
      deriveTournamentStatus('started', [{ status: 'finalized' }, { status: 'finalized' }]),
    ).toBe('finished');
    expect(deriveTournamentStatus('published', [{ status: 'finalized' }])).toBe('finished');
    expect(deriveTournamentStatus('started', [{ state: 'final' }, { state: 'final' }])).toBe(
      'finished',
    );
  });

  it('classifies a tournament as live when matches are in-progress or some finalized with remaining matches', () => {
    expect(
      deriveTournamentStatus('published', [{ status: 'in-progress' }, { status: 'scheduled' }]),
    ).toBe('live');
    expect(
      deriveTournamentStatus('published', [{ status: 'finalized' }, { status: 'scheduled' }]),
    ).toBe('live');
    expect(deriveTournamentStatus('started', [{ status: 'scheduled' }])).toBe('live');
  });

  it('classifies as upcoming when published with no matches or only scheduled matches', () => {
    expect(deriveTournamentStatus('published', [])).toBe('upcoming');
    expect(
      deriveTournamentStatus('published', [{ status: 'scheduled' }, { status: 'scheduled' }]),
    ).toBe('upcoming');
  });
});
