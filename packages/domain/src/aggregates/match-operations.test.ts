import type { RecordedEvent } from '../events/event-log.js';
import {
  applyMatchCommand,
  runningTimers,
  validateLineup,
  type MatchCommand,
} from './match-operations.js';

const codes = {
  starts: { 'blue-card': 120, 'major-penalty': 300 },
  stops: ['power-play-goal'],
};

const NOON = Date.parse('2026-07-31T12:00:00.000Z');

function event(overrides: Partial<RecordedEvent> & { sequence: number }): RecordedEvent {
  return {
    eventId: `e-${overrides.sequence}`,
    matchId: 'm-1',
    segmentId: 'seg-1',
    definitionCode: 'blue-card',
    occurredAt: '2026-07-31T12:00:00.000Z',
    payload: {},
    ...overrides,
  };
}

describe('applyMatchCommand', () => {
  it.each([
    ['start', 'scheduled', 'in-progress', true],
    ['pause', 'in-progress', 'in-progress', false],
    ['resume', 'in-progress', 'in-progress', true],
    ['finalize', 'in-progress', 'finalized', false],
  ] as const)('%s from %s leaves the match %s', (command, status, expected, clockRunning) => {
    const result = applyMatchCommand({ matchId: 'm-1', status }, command, { state: 'active' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe(expected);
    expect(result.value.clockRunning).toBe(clockRunning);
  });

  it('keeps a paused match in progress, because pausing stops a clock and not a competition', () => {
    const paused = applyMatchCommand({ matchId: 'm-1', status: 'in-progress' }, 'pause', {
      state: 'active',
    });

    expect(paused.ok && paused.value.status).toBe('in-progress');
  });

  it.each(['start', 'pause', 'resume', 'finalize'] as const)(
    'refuses %s once the match is finalized',
    (command: MatchCommand) => {
      const result = applyMatchCommand({ matchId: 'm-1', status: 'finalized' }, command, {
        state: 'completed',
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('MATCH_OPERATION_INVALID');
    },
  );

  it('refuses to start a match twice', () => {
    expect(applyMatchCommand({ matchId: 'm-1', status: 'in-progress' }, 'start').ok).toBe(false);
  });

  it('refuses to record anything against a match that never started', () => {
    expect(applyMatchCommand({ matchId: 'm-1', status: 'scheduled' }, 'finalize').ok).toBe(false);
  });

  it('refuses to pause when no segment is running', () => {
    const result = applyMatchCommand({ matchId: 'm-1', status: 'in-progress' }, 'pause', {
      state: 'pending',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('no running segment');
  });
});

describe('runningTimers', () => {
  it('derives what is left from the causing event, at each read', () => {
    const events = [event({ sequence: 1, participantId: 'p-1' })];

    expect(runningTimers(events, codes, NOON)[0]?.remainingSeconds).toBe(120);
    expect(runningTimers(events, codes, NOON + 30_000)[0]?.remainingSeconds).toBe(90);
    expect(runningTimers(events, codes, NOON + 119_000)[0]?.remainingSeconds).toBe(1);
  });

  it('drops a timer that has run out, because expiry is arithmetic', () => {
    const events = [event({ sequence: 1, participantId: 'p-1' })];

    expect(runningTimers(events, codes, NOON + 120_000)).toHaveLength(0);
  });

  it('reads the same twice, because nothing was decremented in between', () => {
    const events = [event({ sequence: 1, participantId: 'p-1' })];

    expect(runningTimers(events, codes, NOON + 30_000)).toEqual(
      runningTimers(events, codes, NOON + 30_000),
    );
  });

  it('runs one timer per person, at any arity', () => {
    const events = [
      event({ sequence: 1, participantId: 'p-1', side: 'entrant-atlas' }),
      event({ sequence: 2, participantId: 'p-2', side: 'entrant-boca' }),
      event({ sequence: 3, participantId: 'p-3', side: 'entrant-river' }),
    ];

    expect(runningTimers(events, codes, NOON + 10_000)).toHaveLength(3);
  });

  it('replaces a person’s timer rather than stacking it', () => {
    const events = [
      event({ sequence: 1, participantId: 'p-1' }),
      event({
        sequence: 2,
        participantId: 'p-1',
        definitionCode: 'major-penalty',
        occurredAt: '2026-07-31T12:00:30.000Z',
      }),
    ];

    const running = runningTimers(events, codes, NOON + 30_000);

    expect(running).toHaveLength(1);
    expect(running[0]?.durationSeconds).toBe(300);
  });

  it('ends one early when the discipline says an event ends it', () => {
    const events = [
      event({ sequence: 1, participantId: 'p-1' }),
      event({
        sequence: 2,
        participantId: 'p-1',
        definitionCode: 'power-play-goal',
        occurredAt: '2026-07-31T12:00:40.000Z',
      }),
    ];

    expect(runningTimers(events, codes, NOON + 45_000)).toHaveLength(0);
  });

  it('ignores an event the discipline does not treat as a timer', () => {
    const events = [event({ sequence: 1, definitionCode: 'goal', participantId: 'p-1' })];

    expect(runningTimers(events, codes, NOON)).toHaveLength(0);
  });

  it('ignores an event whose instant cannot be read, rather than starting a timer at zero', () => {
    const events = [event({ sequence: 1, participantId: 'p-1', occurredAt: 'sometime' })];

    expect(runningTimers(events, codes, NOON)).toHaveLength(0);
  });

  it('folds in log order, whatever order the rows arrive in', () => {
    const later = event({
      sequence: 2,
      participantId: 'p-1',
      definitionCode: 'power-play-goal',
      occurredAt: '2026-07-31T12:00:40.000Z',
    });
    const earlier = event({ sequence: 1, participantId: 'p-1' });

    expect(runningTimers([later, earlier], codes, NOON + 45_000)).toHaveLength(0);
  });
});

describe('validateLineup', () => {
  const roster = ['p-1', 'p-2', 'p-3', 'p-4', 'p-5'];
  const constraint = { minPlayers: 2, maxPlayers: 4 };
  const selection = { matchId: 'm-1', entrantId: 'entrant-atlas', participantIds: ['p-1', 'p-2'] };

  function check(participantIds: readonly string[]) {
    const result = validateLineup({ ...selection, participantIds }, roster, constraint);
    if (!result.ok) throw result.error;
    return result.value;
  }

  it('accepts a lineup drawn from the active roster, with nothing to say about it', () => {
    expect(check(['p-1', 'p-2']).findings).toEqual([]);
  });

  it('reports someone who is not on the roster, and does not refuse the sheet', () => {
    const checked = check(['p-1', 'p-transferred']);

    expect(checked.findings).toEqual([
      expect.objectContaining({ kind: 'off-roster', participantId: 'p-transferred' }),
    ]);
    // The organizer signs the sheet; CopaLibre says what it noticed.
    expect(checked.selection.participantIds).toContain('p-transferred');
  });

  it.each([
    ['below', ['p-1'], 'below-minimum'],
    ['above', ['p-1', 'p-2', 'p-3', 'p-4', 'p-5'], 'above-maximum'],
  ])('reports a lineup %s what the discipline expects, without blocking it', (_l, ids, kind) => {
    expect(check(ids).findings).toEqual([expect.objectContaining({ kind })]);
  });

  it('reports every finding at once, rather than the first one it met', () => {
    const checked = check(['p-transferred']);

    expect(checked.findings.map((finding) => finding.kind)).toEqual([
      'off-roster',
      'below-minimum',
    ]);
  });

  it('refuses the same person named twice, because that sheet contradicts itself', () => {
    // Not a rule a competition might relax: no federation wants it recorded.
    const result = validateLineup(
      { ...selection, participantIds: ['p-1', 'p-1'] },
      roster,
      constraint,
    );

    expect(result.ok).toBe(false);
  });
});
