import { bindCapabilities } from '../capabilities/binder.js';
import { fixtureDescriptor } from '../test-support/fixture-descriptor.js';
import { fixtureProfile } from '../test-support/fixture-profile.js';
import type { Tournament } from './tournament.js';
import { hasStarted } from './tournament.js';
import {
  canChangeModuleVersion,
  ModuleFrozenError,
  StartValidationError,
  validateStart,
} from './tournament-start.js';

function tournament(overrides?: Partial<Tournament>): Tournament {
  return {
    tournamentId: 't-1',
    organizationId: 'org-1',
    alias: 'copa-verano',
    name: 'Copa Verano',
    disciplineRef: { descriptorId: 'd-1', version: '3.0.0' },
    status: 'published',
    ...overrides,
  };
}

const ready = { entrantsLocked: true, fixturesGenerated: true };

/** Binding whose required capability nothing satisfied. */
function unsatisfiedBinding(overridden = false) {
  const bare = fixtureDescriptor({ statistics: [], scoringInputs: [] });
  const bound = bindCapabilities(bare, fixtureProfile(), {
    overrideUnsatisfied: overridden,
  });
  return overridden && bound.ok ? bound.value : !bound.ok ? bound.error.partial : undefined;
}

describe('validateStart', () => {
  it('allows a published tournament with everything in place', () => {
    expect(validateStart(tournament(), ready).ok).toBe(true);
  });

  it('refuses a draft', () => {
    const result = validateStart(tournament({ status: 'draft' }), ready);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.failures[0]).toContain('still a draft');
  });

  it.each(['started', 'finished'] as const)('refuses a tournament already %s', (status) => {
    const result = validateStart(tournament({ status }), ready);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.failures.join(' ')).toContain(`already ${status}`);
  });

  it('refuses when entrants are not locked', () => {
    const result = validateStart(tournament(), { ...ready, entrantsLocked: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.failures).toContain('entrants are not locked');
  });

  it('refuses when fixtures are not generated', () => {
    const result = validateStart(tournament(), { ...ready, fixturesGenerated: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.failures).toContain('fixtures have not been generated');
  });

  it('reports every failure at once rather than the first', () => {
    const result = validateStart(tournament({ status: 'draft' }), {
      entrantsLocked: false,
      fixturesGenerated: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.failures).toHaveLength(3);
  });

  it('refuses unsatisfied required capabilities with no override', () => {
    const binding = unsatisfiedBinding(false);
    const result = validateStart(tournament(), { ...ready, binding });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.failures.join(' ')).toContain('primary-scoring');
      expect(result.error.failures.join(' ')).toContain('no override was accepted');
    }
  });

  it('allows unsatisfied capabilities when the operator accepts at start time', () => {
    const binding = unsatisfiedBinding(false);
    const result = validateStart(tournament(), {
      ...ready,
      binding,
      capabilityOverrideAccepted: true,
    });
    expect(result.ok).toBe(true);
  });

  it('allows when the override was already recorded on the binding', () => {
    const binding = unsatisfiedBinding(true);
    expect(validateStart(tournament(), { ...ready, binding }).ok).toBe(true);
  });

  it('allows a fully satisfied binding without any override', () => {
    const football = fixtureDescriptor({
      statistics: [
        { code: 'goals-for', label: 'Goals For', aggregation: 'sum' },
        { code: 'goals-against', label: 'Goals Against', aggregation: 'sum' },
      ],
      scoringInputs: [],
    });
    const bound = bindCapabilities(football, fixtureProfile());
    expect(bound.ok && validateStart(tournament(), { ...ready, binding: bound.value }).ok).toBe(
      true,
    );
  });

  it('carries the failures on a typed error', () => {
    const result = validateStart(tournament({ status: 'draft' }), ready);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(StartValidationError);
      expect(result.error.code).toBe('TOURNAMENT_START_REFUSED');
    }
  });
});

describe('canChangeModuleVersion', () => {
  it.each(['draft', 'published'] as const)('permits a change while %s', (status) => {
    expect(canChangeModuleVersion(tournament({ status })).ok).toBe(true);
  });

  it.each(['started', 'finished'] as const)('freezes modules once %s', (status) => {
    const result = canChangeModuleVersion(tournament({ status }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ModuleFrozenError);
      expect(result.error.message).toContain('audited correction workflow');
    }
  });
});

describe('hasStarted', () => {
  it.each([
    ['draft', false],
    ['published', false],
    ['started', true],
    ['finished', true],
  ] as const)('%s -> %s', (status, expected) => {
    expect(hasStarted(tournament({ status }))).toBe(expected);
  });
});
