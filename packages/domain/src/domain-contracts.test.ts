import { MVP_FORMATS } from './descriptors/discipline-descriptor';
import { EventLog } from './events/event-log';
import { Alias } from './identifiers/alias';
import { UuidV7 } from './identifiers/uuid-v7';
import { compileEffectiveRuleset } from './rulesets/compiler';
import { err, ok, unwrap } from './result';
import { fixtureDescriptor } from './test-support/fixture-descriptor';

describe('MVP format catalogue', () => {
  it('advertises exactly the six formats from the tournament-engine decision', () => {
    expect(MVP_FORMATS).toEqual([
      'single-elimination',
      'double-elimination',
      'round-robin',
      'league',
      'round-robin-single-leg',
      'round-robin-home-away',
    ]);
  });
});

describe('Result helpers', () => {
  it('unwrap returns the ok value', () => {
    expect(unwrap(ok(42))).toBe(42);
  });

  it('unwrap throws the typed error it carries', () => {
    const error = new Error('typed');
    expect(() => unwrap(err(error))).toThrow(error);
  });

  it('unwrap wraps a non-Error payload into an Error', () => {
    expect(() => unwrap(err({ code: 'X' }))).toThrow(/unwrap\(\) on error result/);
  });
});

describe('UuidV7 edge behavior', () => {
  it('compare returns 1 when this sorts after other', () => {
    const earlier = UuidV7.generate();
    const later = UuidV7.generate();
    expect(later.compare(earlier)).toBe(1);
  });

  it('stays strictly ordered under sustained high-frequency generation', () => {
    // Thousands of generations per millisecond exercise the library's
    // same-ms sequence handling; ordering must never regress.
    let previous = UuidV7.generate();
    for (let i = 0; i < 4200; i += 1) {
      const next = UuidV7.generate();
      expect(previous.compare(next)).toBe(-1);
      previous = next;
    }
  });

  it('toString returns the canonical form', () => {
    const id = UuidV7.generate();
    expect(id.toString()).toBe(id.value);
  });
});

describe('Alias string form', () => {
  it('toString returns the raw value', () => {
    const alias = unwrap(Alias.create('organization', 'club-atlas'));
    expect(alias.toString()).toBe('club-atlas');
    expect(`${alias}`).toBe('club-atlas');
  });
});

describe('participant-or-staff actor requirement', () => {
  it('accepts a participant and rejects a missing one', () => {
    const base = fixtureDescriptor();
    const descriptor = fixtureDescriptor({
      eventDefinitions: [
        ...base.eventDefinitions,
        {
          code: 'bench-warning',
          label: 'Bench Warning',
          category: 'negative',
          permittedSegmentTypes: ['half'],
          actorRequirement: 'participant-or-staff',
          payloadSchema: { type: 'object', properties: {} },
        },
      ],
    });
    const log = new EventLog(descriptor);
    const segment = {
      segmentId: 'seg-1',
      matchId: 'm-1',
      type: 'half',
      number: 1,
      state: 'active',
    } as const;
    const withActor = log.record({
      eventId: 'e-1',
      matchId: 'm-1',
      segment,
      definitionCode: 'bench-warning',
      occurredAt: '2026-07-29T12:00:00.000Z',
      participantId: 'coach-1',
    });
    expect(withActor.ok).toBe(true);
    const withoutActor = log.record({
      eventId: 'e-2',
      matchId: 'm-1',
      segment,
      definitionCode: 'bench-warning',
      occurredAt: '2026-07-29T12:00:01.000Z',
    });
    expect(withoutActor.ok).toBe(false);
  });
});

describe('merge shape mismatches per strategy', () => {
  it('append-list rejects a non-list override', () => {
    const descriptor = fixtureDescriptor({
      defaults: { ...fixtureDescriptor().defaults, noteTemplates: ['warmup'] },
    });
    const result = compileEffectiveRuleset(descriptor, {
      rulesetId: 'rs-1',
      tournamentId: 't-1',
      version: 1,
      descriptorRef: { descriptorId: 'd', version: 3 },
      overrides: { noteTemplates: 'not-a-list' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.violations[0]?.reason).toBe('missing-merge-strategy');
    }
  });

  it('shallow-object rejects a non-object override', () => {
    const result = compileEffectiveRuleset(fixtureDescriptor(), {
      rulesetId: 'rs-1',
      tournamentId: 't-1',
      version: 1,
      descriptorRef: { descriptorId: 'd', version: 3 },
      overrides: { segments: ['not', 'an', 'object'] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.violations[0]?.reason).toBe('missing-merge-strategy');
    }
  });

  it('replaced override creates missing intermediate path nodes', () => {
    const base = fixtureDescriptor();
    const descriptor = fixtureDescriptor({
      fieldPolicies: {
        ...base.fieldPolicies,
        'broadcast.overlay.theme': {
          permission: { kind: 'replaced' },
          mutationClass: 'safe',
        },
      },
    });
    const result = compileEffectiveRuleset(descriptor, {
      rulesetId: 'rs-1',
      tournamentId: 't-1',
      version: 1,
      descriptorRef: { descriptorId: 'd', version: 3 },
      overrides: { 'broadcast.overlay.theme': 'dark' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.config).toMatchObject({
        broadcast: { overlay: { theme: 'dark' } },
      });
    }
  });
});
