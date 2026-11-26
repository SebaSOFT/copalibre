import { fixtureDescriptor } from '../test-support/fixture-descriptor.js';
import { validateDisciplineDescriptorDocument } from './descriptor-schema.js';
import type { DisciplineDescriptor, MatchCounterDefinition } from './discipline-descriptor.js';
import {
  matchCounterOverrideProblem,
  resolveEffectiveMatchCounters,
} from './match-counter-resolution.js';
import { compileEffectiveRuleset } from '../rulesets/compiler.js';
import { countMatchCounters } from './match-counter-count.js';
import type { RecordedEvent } from '../events/event-log.js';
import type { MatchRoster, Segment } from '../aggregates/competition.js';

const FOUL: MatchCounterDefinition = {
  code: 'team-fouls',
  label: { en: 'Team fouls', es: 'Faltas de equipo' },
  shortLabel: 'F',
  events: ['strike'],
  scope: 'match',
  warnAt: 9,
};

const TIMEOUT: MatchCounterDefinition = {
  code: 'timeouts',
  label: 'Timeouts',
  shortLabel: 'TM',
  events: ['strike'],
  scope: 'segment',
  allowance: 1,
};

function documentWith(matchCounters: unknown): unknown {
  const document = JSON.parse(JSON.stringify(fixtureDescriptor())) as Record<string, unknown>;
  delete document.descriptorId;
  return { ...document, matchCounters };
}

function withCounters(counters: readonly MatchCounterDefinition[]): DisciplineDescriptor {
  return fixtureDescriptor({ matchCounters: counters });
}

describe('matchCounters schema and validation', () => {
  it('accepts a descriptor without counters', () => {
    const document = JSON.parse(JSON.stringify(fixtureDescriptor())) as Record<string, unknown>;
    delete document.descriptorId;
    expect(validateDisciplineDescriptorDocument(document).ok).toBe(true);
  });

  it('accepts a valid counter set', () => {
    const result = validateDisciplineDescriptorDocument(documentWith([FOUL, TIMEOUT]));
    expect(result.ok).toBe(true);
  });

  it('rejects a counter over an undeclared event with the entry path', () => {
    const result = validateDisciplineDescriptorDocument(
      documentWith([{ ...FOUL, events: ['technical-foul'] }]),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details?.field).toBe('matchCounters[0].events');
  });

  it('rejects a duplicate counter code', () => {
    const result = validateDisciplineDescriptorDocument(
      documentWith([FOUL, { ...TIMEOUT, code: FOUL.code }]),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a short label longer than three characters', () => {
    const result = validateDisciplineDescriptorDocument(
      documentWith([{ ...FOUL, shortLabel: { en: 'FOUL' } }]),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details?.field).toBe('matchCounters[0].shortLabel');
  });

  it('rejects a counter without events', () => {
    const result = validateDisciplineDescriptorDocument(documentWith([{ ...FOUL, events: [] }]));
    expect(result.ok).toBe(false);
  });
});

describe('resolveEffectiveMatchCounters', () => {
  it('returns the declared counters when no override applies', () => {
    const descriptor = withCounters([FOUL, TIMEOUT]);
    expect(resolveEffectiveMatchCounters(descriptor).map((c) => c.code)).toEqual([
      'team-fouls',
      'timeouts',
    ]);
  });

  it('hides a counter, replaces its warning value and clears an allowance with null', () => {
    const descriptor = withCounters([FOUL, TIMEOUT]);
    const effective = resolveEffectiveMatchCounters(descriptor, {
      matchCounters: {
        'team-fouls': { warnAt: 10 },
        timeouts: { allowance: null },
      },
    });
    expect(effective.find((c) => c.code === 'team-fouls')?.warnAt).toBe(10);
    expect(effective.find((c) => c.code === 'timeouts')?.allowance).toBeUndefined();

    const hidden = resolveEffectiveMatchCounters(descriptor, {
      matchCounters: { timeouts: { hidden: true } },
    });
    expect(hidden.map((c) => c.code)).toEqual(['team-fouls']);
  });

  it('ignores the override only when the descriptor forbids it', () => {
    const descriptor = fixtureDescriptor({
      matchCounters: [FOUL],
      fieldPolicies: {
        matchCounters: {
          permission: { kind: 'forbidden' },
          mutationClass: 'safe',
        },
      },
    });
    const effective = resolveEffectiveMatchCounters(descriptor, {
      matchCounters: { 'team-fouls': { hidden: true } },
    });
    expect(effective.map((c) => c.code)).toEqual(['team-fouls']);
  });
});

describe('countMatchCounters', () => {
  const entrants = ['home', 'away'];
  const segment = (number: number, state: Segment['state']): Segment => ({
    segmentId: `seg-${number}`,
    matchId: 'match-1',
    type: 'half',
    number,
    state,
  });
  const event = (
    eventId: string,
    segmentId: string,
    side?: string,
    personId?: string,
  ): RecordedEvent => ({
    eventId,
    matchId: 'match-1',
    segmentId,
    definitionCode: 'strike',
    occurredAt: '2026-11-18T10:00:00.000Z',
    sequence: Number(eventId.replace(/\D/g, '')) || 1,
    ...(side === undefined ? {} : { side }),
    ...(personId === undefined ? {} : { personId }),
    payload: {},
  });
  const rosters: readonly MatchRoster[] = [
    {
      matchId: 'match-1',
      entrantId: 'away',
      members: [{ personId: 'p-9', name: 'Player nine', onField: true }],
    },
  ];

  it('counts match scope across every segment', () => {
    const events = [
      event('e1', 'seg-1', 'home'),
      event('e2', 'seg-2', 'home'),
      event('e3', 'seg-2', 'away'),
    ];
    const [tally] = countMatchCounters(
      [FOUL],
      events,
      [segment(1, 'completed'), segment(2, 'active')],
      [],
      entrants,
    );
    expect(tally?.values).toEqual([
      { entrantId: 'home', value: 2 },
      { entrantId: 'away', value: 1 },
    ]);
  });

  it('restarts a segment counter each segment, counting the active segment only', () => {
    const events = [event('e1', 'seg-1', 'home'), event('e2', 'seg-1', 'home')];
    const [tally] = countMatchCounters(
      [TIMEOUT],
      events,
      [segment(1, 'completed'), segment(2, 'active')],
      [],
      entrants,
    );
    expect(tally?.values.find((v) => v.entrantId === 'home')?.value).toBe(0);
  });

  it('keeps the last segment value between segments', () => {
    const events = [event('e1', 'seg-1', 'home')];
    const [tally] = countMatchCounters(
      [TIMEOUT],
      events,
      [segment(1, 'completed'), segment(2, 'pending')],
      [],
      entrants,
    );
    expect(tally?.values.find((v) => v.entrantId === 'home')?.value).toBe(1);
  });

  it('attributes a person event to the side the person is rostered for and skips unattributable events', () => {
    const events = [
      event('e1', 'seg-1', undefined, 'p-9'),
      event('e2', 'seg-1', undefined, 'p-unknown'),
      event('e3', 'seg-1', 'stranger'),
    ];
    const [tally] = countMatchCounters([FOUL], events, [segment(1, 'active')], rosters, entrants);
    expect(tally?.values).toEqual([
      { entrantId: 'home', value: 0 },
      { entrantId: 'away', value: 1 },
    ]);
  });

  it('does not clamp a value past its allowance', () => {
    const events = [event('e1', 'seg-1', 'home'), event('e2', 'seg-1', 'home')];
    const [tally] = countMatchCounters([TIMEOUT], events, [segment(1, 'active')], [], entrants);
    expect(tally?.values.find((v) => v.entrantId === 'home')?.value).toBe(2);
  });
});

describe('matchCounters override validation', () => {
  const compile = (descriptor: DisciplineDescriptor, overrides: unknown) =>
    compileEffectiveRuleset(descriptor, {
      rulesetId: 'r1',
      version: 1,
      overrides: { matchCounters: overrides },
    } as never);

  it.each([
    ['a null counter entry', { 'team-fouls': null }],
    ['a string instead of an object', 'abc'],
    ['a negative allowance', { timeouts: { allowance: -3 } }],
    ['a string allowance', { timeouts: { allowance: 'abc' } }],
    ['an unknown key', { timeouts: { color: 'red' } }],
    ['a non-boolean hidden flag', { timeouts: { hidden: 'yes' } }],
  ])('reports %s as an invalid override, and the compilation fails', (_name, overrides) => {
    expect(matchCounterOverrideProblem(overrides)).toBeDefined();
    const result = compile(withCounters([FOUL, TIMEOUT]), overrides);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.violations).toEqual([
      expect.objectContaining({ field: 'matchCounters', reason: 'invalid-override' }),
    ]);
  });

  it('accepts a well-formed override, with null clearing a default', () => {
    expect(
      matchCounterOverrideProblem({
        'team-fouls': { warnAt: 10 },
        timeouts: { allowance: null, hidden: false },
      }),
    ).toBeUndefined();
    expect(compile(withCounters([FOUL, TIMEOUT]), { timeouts: { allowance: null } }).ok).toBe(true);
  });

  it('never throws in the resolver on a malformed override, and skips the bad entries', () => {
    const descriptor = withCounters([FOUL, TIMEOUT]);
    expect(() =>
      resolveEffectiveMatchCounters(descriptor, { matchCounters: { 'team-fouls': null } }),
    ).not.toThrow();
    expect(
      resolveEffectiveMatchCounters(descriptor, { matchCounters: 'abc' }).map((c) => c.code),
    ).toEqual(['team-fouls', 'timeouts']);
    expect(
      resolveEffectiveMatchCounters(descriptor, {
        matchCounters: { timeouts: { allowance: -3 } },
      }).find((c) => c.code === 'timeouts')?.allowance,
    ).toBe(1);
  });

  it('rejects any override under an explicit forbidden field policy', () => {
    const descriptor = fixtureDescriptor({
      matchCounters: [FOUL],
      fieldPolicies: {
        matchCounters: { permission: { kind: 'forbidden' }, mutationClass: 'safe' },
      },
    });
    const result = compile(descriptor, { 'team-fouls': { hidden: true } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.violations).toEqual([
      expect.objectContaining({ field: 'matchCounters', reason: 'forbidden-override' }),
    ]);
  });
});
