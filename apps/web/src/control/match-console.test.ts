import { describe, expect, it } from '@jest/globals';
import { publicIntl, sideSourceLabels } from '../lib/i18n/public-intl.js';
import {
  awaitingSourceText,
  clockActionsOf,
  currentEpochMilliseconds,
  currentSegmentOf,
  descriptionFor,
  formatClock,
  isEventPermitted,
  memberByNumber,
  newIdempotencyKey,
  segmentLabel,
  selectedSegmentOf,
  sentOffPersonIds,
  undecidedSidesOf,
} from './lib/match-console.js';
import type {
  ConsoleEventDefinition,
  ConsoleMatchEvent,
  ConsoleRoster,
  ConsoleSegment,
  MatchConsoleResponse,
} from './lib/api-client.js';

function definition(overrides: Partial<ConsoleEventDefinition> = {}): ConsoleEventDefinition {
  return {
    code: 'goal',
    label: 'Gol',
    category: 'positive',
    permittedSegmentTypes: ['half'],
    actorRequirement: 'side',
    payloadSchema: {},
    display: {},
    secondaryActorFields: [],
    ...overrides,
  };
}

function segment(overrides: Partial<ConsoleSegment> = {}): ConsoleSegment {
  return {
    segmentId: 'segment-1',
    type: 'half',
    number: 1,
    state: 'active',
    elapsedSeconds: 0,
    ...overrides,
  };
}

describe('newIdempotencyKey', () => {
  it('produces a UUID-shaped, non-empty key', () => {
    const key = newIdempotencyKey();
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('produces a different key on every call', () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });
});

describe('currentEpochMilliseconds', () => {
  it('returns a positive integer close to Date.now()', () => {
    const before = Date.now();
    const value = currentEpochMilliseconds();
    const after = Date.now();
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(after);
  });
});

describe('formatClock', () => {
  it('formats zero seconds', () => {
    expect(formatClock(0)).toBe('00:00');
  });

  it('formats a sub-minute duration', () => {
    expect(formatClock(45)).toBe('00:45');
  });

  it('formats an hour-plus duration by rolling minutes past 59', () => {
    expect(formatClock(3_725)).toBe('62:05');
  });

  it('floors a fractional second value', () => {
    expect(formatClock(89.9)).toBe('01:29');
  });

  it('clamps a negative value to zero', () => {
    expect(formatClock(-5)).toBe('00:00');
  });
});

describe('descriptionFor', () => {
  it('returns undefined for blank input', () => {
    const def = definition({ payloadSchema: { properties: { description: {} } } });
    expect(descriptionFor(def, '   ')).toBeUndefined();
  });

  it('returns undefined when the definition does not declare a description field', () => {
    const def = definition({ payloadSchema: {} });
    expect(descriptionFor(def, 'Falta clara')).toBeUndefined();
  });

  it('returns the trimmed description when the definition declares the field', () => {
    const def = definition({ payloadSchema: { properties: { description: {} } } });
    expect(descriptionFor(def, '  Falta clara  ')).toBe('Falta clara');
  });
});

describe('segmentLabel', () => {
  const projection = {
    segments: [segment({ segmentId: 's1', type: 'half', number: 2 })],
  } as unknown as MatchConsoleResponse;

  it('labels a known segment by type and number', () => {
    expect(segmentLabel(projection, 's1', 'Unknown segment')).toBe('half 2');
  });

  it('falls back to the caller-supplied label for a segment id the projection does not carry', () => {
    expect(segmentLabel(projection, 'missing', 'Unknown segment')).toBe('Unknown segment');
  });
});

describe('isEventPermitted', () => {
  const base = { entrants: [{ entrantId: 'e1' }], eligiblePersonIds: [], eligibleStaffIds: [] };

  it('refuses every definition when there is no active segment', () => {
    expect(isEventPermitted(definition(), base, undefined)).toBe(false);
  });

  it('refuses a definition whose permitted segment types exclude the active segment', () => {
    const def = definition({ permittedSegmentTypes: ['extra-time'] });
    expect(isEventPermitted(def, base, segment({ type: 'half' }))).toBe(false);
  });

  it('permits a side-attributed definition once an entrant exists', () => {
    const def = definition({ actorRequirement: 'side' });
    expect(isEventPermitted(def, base, segment())).toBe(true);
    expect(isEventPermitted(def, { ...base, entrants: [] }, segment())).toBe(false);
  });

  it('permits a person-attributed definition only when an eligible person exists', () => {
    const def = definition({ actorRequirement: 'person' });
    expect(isEventPermitted(def, base, segment())).toBe(false);
    expect(isEventPermitted(def, { ...base, eligiblePersonIds: ['p1'] }, segment())).toBe(true);
  });

  it('permits a person-or-staff definition when either pool has an eligible actor', () => {
    const def = definition({ actorRequirement: 'person-or-staff' });
    expect(isEventPermitted(def, base, segment())).toBe(false);
    expect(isEventPermitted(def, { ...base, eligibleStaffIds: ['staff1'] }, segment())).toBe(true);
    expect(isEventPermitted(def, { ...base, eligiblePersonIds: ['p1'] }, segment())).toBe(true);
  });

  it('permits an unattributed definition whenever the segment matches', () => {
    const def = definition({ actorRequirement: 'none' });
    expect(isEventPermitted(def, { ...base, entrants: [] }, segment())).toBe(true);
  });
});

function matchEvent(overrides: Partial<ConsoleMatchEvent> = {}): ConsoleMatchEvent {
  return {
    eventId: 'event-1',
    definitionCode: 'goal',
    segmentId: 'segment-1',
    sequence: 1,
    occurredAt: '2026-08-15T20:00:00.000Z',
    ...overrides,
  };
}

describe('sentOffPersonIds', () => {
  it('collects persons a red-card event was recorded against', () => {
    const ids = sentOffPersonIds([
      matchEvent({ definitionCode: 'red-card', personId: 'p1' }),
      matchEvent({ definitionCode: 'goal', personId: 'p2' }),
      matchEvent({ definitionCode: 'red-card', personId: 'p3' }),
    ]);
    expect(ids).toEqual(new Set(['p1', 'p3']));
  });

  it('ignores a red-card event with no person attributed', () => {
    expect(sentOffPersonIds([matchEvent({ definitionCode: 'red-card' })])).toEqual(new Set());
  });

  it('returns an empty set for no matching events', () => {
    expect(sentOffPersonIds([])).toEqual(new Set());
  });
});

function roster(entrantId: string, members: ConsoleRoster['members']): ConsoleRoster {
  return { entrantId, members };
}

describe('memberByNumber', () => {
  const rosters: readonly ConsoleRoster[] = [
    roster('entrant-a', [
      { personId: 'a1', number: 1, name: 'A One', onField: true },
      { personId: 'a10', number: 10, name: 'A Ten', onField: true },
    ]),
    roster('entrant-b', [
      { personId: 'b1', number: 1, name: 'B One', onField: true },
      { personId: 'b7', number: '7B', name: 'B Seven', onField: false },
    ]),
  ];

  it('returns the unique member across both rosters matching the digits', () => {
    expect(memberByNumber(rosters, '10')).toEqual({
      entrantId: 'entrant-a',
      member: rosters[0]?.members[1],
    });
  });

  it('matches a non-numeric jersey number by exact string', () => {
    expect(memberByNumber(rosters, '7B')).toEqual({
      entrantId: 'entrant-b',
      member: rosters[1]?.members[1],
    });
  });

  it('returns undefined when both teams share the same number, ambiguously', () => {
    expect(memberByNumber(rosters, '1')).toBeUndefined();
  });

  it('returns undefined when nothing matches', () => {
    expect(memberByNumber(rosters, '99')).toBeUndefined();
  });

  it('returns undefined for an empty digit buffer', () => {
    expect(memberByNumber(rosters, '')).toBeUndefined();
  });
});

describe('undecidedSidesOf', () => {
  const winnerOf = (position: number) => ({
    kind: 'winner-of' as const,
    nodeKey: `SE-R1-M${position}`,
    round: 1,
    position,
  });

  it('lists each side whose source has no positioned entrant yet', () => {
    expect(undecidedSidesOf({ homeSource: winnerOf(1), awaySource: winnerOf(2) })).toEqual([
      { side: 'home', source: winnerOf(1) },
      { side: 'away', source: winnerOf(2) },
    ]);
    expect(
      undecidedSidesOf({ homeSource: winnerOf(1), awaySource: winnerOf(2), awayEntrantId: 'b' }),
    ).toEqual([{ side: 'home', source: winnerOf(1) }]);
  });

  it('never awaits a decided, seeded or legacy side', () => {
    expect(undecidedSidesOf({})).toEqual([]);
    expect(
      undecidedSidesOf({
        homeSource: { kind: 'entrant', entrantId: 'a' },
        awaySource: winnerOf(2),
        homeEntrantId: 'a',
        awayEntrantId: 'b',
      }),
    ).toEqual([]);
  });

  it('words the awaited source with the shared formatter', () => {
    const labels = sideSourceLabels(publicIntl('es'));
    expect(awaitingSourceText({ ...winnerOf(2), nodeKey: 'SE-R1-M2' }, labels, 2)).toBe(
      'Esperando Ganador de Semifinal 2',
    );
    expect(awaitingSourceText(winnerOf(2), labels)).toBe('Esperando Ganador de Ronda 1, partido 2');
  });
});

describe('currentSegmentOf', () => {
  it('is the running segment', () => {
    const running = segment({ segmentId: 's2', number: 2, state: 'active' });
    expect(
      currentSegmentOf([segment({ segmentId: 's1', state: 'completed' }), running])?.segmentId,
    ).toBe('s2');
  });

  it('is the first segment not yet ended when none is running', () => {
    expect(
      currentSegmentOf([
        segment({ segmentId: 's1', state: 'completed' }),
        segment({ segmentId: 's2', number: 2, state: 'pending' }),
        segment({ segmentId: 's3', number: 3, state: 'pending' }),
      ])?.segmentId,
    ).toBe('s2');
  });

  it('is the last segment once every one has ended', () => {
    expect(
      currentSegmentOf([
        segment({ segmentId: 's1', state: 'completed' }),
        segment({ segmentId: 's2', number: 2, state: 'completed' }),
      ])?.segmentId,
    ).toBe('s2');
  });

  it('is undefined for a match with no segments', () => {
    expect(currentSegmentOf([])).toBeUndefined();
  });
});

describe('clockActionsOf', () => {
  const running = segment({ state: 'active' });
  const paused = segment({ state: 'pending' });
  const ended = segment({ state: 'completed' });

  it('offers only Start, as the primary action, before kick-off', () => {
    expect(clockActionsOf('scheduled', [paused], paused)).toEqual({
      commands: [{ command: 'start', primary: true }],
      finalizePrimary: false,
    });
  });

  it('offers Pause as the primary action, never Start, while a segment runs', () => {
    expect(clockActionsOf('in-progress', [running], running)).toEqual({
      commands: [
        { command: 'pause', primary: true },
        { command: 'end', primary: false },
      ],
      finalizePrimary: false,
    });
  });

  it('offers a resume as the primary action while the clock is stopped mid-match', () => {
    expect(clockActionsOf('in-progress', [paused], paused)).toEqual({
      commands: [
        { command: 'resume', primary: true },
        { command: 'end', primary: false },
      ],
      finalizePrimary: false,
    });
  });

  it('offers no clock command for an ended segment and leaves Finalize as the primary action', () => {
    expect(clockActionsOf('in-progress', [ended], ended)).toEqual({
      commands: [],
      finalizePrimary: true,
    });
  });

  it('keeps Finalize secondary while another segment still has to be played', () => {
    expect(clockActionsOf('in-progress', [ended, paused], ended)).toEqual({
      commands: [],
      finalizePrimary: false,
    });
  });

  it('offers no clock command without segments and leaves Finalize as the primary action', () => {
    expect(clockActionsOf('in-progress', [], undefined)).toEqual({
      commands: [],
      finalizePrimary: true,
    });
    expect(clockActionsOf('scheduled', [], undefined)).toEqual({
      commands: [],
      finalizePrimary: false,
    });
  });

  it('offers nothing once the match is finalized', () => {
    expect(clockActionsOf('finalized', [ended], ended)).toEqual({
      commands: [],
      finalizePrimary: false,
    });
  });
});

describe('selectedSegmentOf', () => {
  const segments = [
    segment({ segmentId: 's1', state: 'completed' }),
    segment({ segmentId: 's2', number: 2, state: 'pending' }),
  ];

  it('is the segment the operator picked', () => {
    expect(selectedSegmentOf(segments, 's1')?.segmentId).toBe('s1');
  });

  it('follows the match when nothing is picked', () => {
    expect(selectedSegmentOf(segments, '')?.segmentId).toBe('s2');
  });

  it('follows the match when the pick no longer names a segment of it', () => {
    expect(selectedSegmentOf(segments, 'gone')?.segmentId).toBe('s2');
  });
});
