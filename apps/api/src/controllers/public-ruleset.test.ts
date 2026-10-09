import { describe, expect, it } from 'vitest';
import type { DisciplineDescriptor, TournamentRuleset } from '@copalibre/domain';
import { publicRuleset } from './public-ruleset.js';

const policy = { permission: { kind: 'replaced' }, mutationClass: 'safe' } as const;

const descriptor = {
  descriptorId: 'd',
  version: '1.0.0',
  defaults: {
    format: 'round-robin',
    registration: { publicOpen: false, capacity: null },
    scoring: { pointsPerWin: 3, pointsPerDraw: 1 },
    tiebreakers: ['points', 'goals-for'],
    venuePolicy: { neutralGround: false },
    series: { span: 5 },
  },
  fieldPolicies: {
    format: policy,
    'registration.publicOpen': policy,
    'scoring.pointsPerWin': policy,
    'scoring.pointsPerDraw': policy,
    tiebreakers: { permission: { kind: 'merged' }, mutationClass: 'safe' },
    'venuePolicy.neutralGround': policy,
    'series.span': { ...policy, label: { en: 'Series length', es: 'Largo de la serie' } },
    'series.missing': policy,
  },
} as unknown as DisciplineDescriptor;

const overriding = (overrides: Record<string, unknown>) =>
  ({ rulesetId: 'r', version: 1, overrides }) as unknown as TournamentRuleset;

describe('publicRuleset', () => {
  it('lists the discipline defaults of a tournament that overrides nothing', () => {
    const { ruleset } = publicRuleset(descriptor, overriding({}));
    expect(ruleset).toEqual({
      format: 'round-robin',
      'scoring.pointsPerWin': '3',
      'scoring.pointsPerDraw': '1',
      'venuePolicy.neutralGround': 'false',
      'series.span': '5',
      tiebreakers: 'points,goals-for',
    });
  });

  it('prints a list of tiebreakers, a statistic entry as its code, and skips a list it cannot read', () => {
    const withObject = {
      ...descriptor,
      defaults: {
        ...descriptor.defaults,
        tiebreakers: ['points', { statisticCode: 'goal-average' }],
      },
    } as unknown as DisciplineDescriptor;
    expect(publicRuleset(withObject, overriding({})).ruleset.tiebreakers).toBe(
      'points,goal-average',
    );
    const unreadable = {
      ...descriptor,
      defaults: { ...descriptor.defaults, tiebreakers: [{ other: 1 }] },
    } as unknown as DisciplineDescriptor;
    expect(publicRuleset(unreadable, overriding({})).ruleset.tiebreakers).toBeUndefined();
  });

  it('lists defaults even when the tournament has no ruleset at all', () => {
    expect(publicRuleset(descriptor, undefined).ruleset['scoring.pointsPerWin']).toBe('3');
  });

  it('shows an override in place of its default and leaves the others', () => {
    const { ruleset } = publicRuleset(descriptor, overriding({ 'scoring.pointsPerWin': 2 }));
    expect(ruleset['scoring.pointsPerWin']).toBe('2');
    expect(ruleset['scoring.pointsPerDraw']).toBe('1');
  });

  it('leaves out enrolment settings and fields with no value', () => {
    const { ruleset } = publicRuleset(descriptor, overriding({}));
    expect(Object.keys(ruleset)).not.toContain('registration.publicOpen');
    expect(Object.keys(ruleset)).not.toContain('series.missing');
  });

  it('labels a field by its declared label, else the platform’s standard name', () => {
    const { labels } = publicRuleset(descriptor, overriding({}));
    expect(labels['series.span']).toEqual({ en: 'Series length', es: 'Largo de la serie' });
    expect(labels['scoring.pointsPerDraw']).toMatchObject({ es: 'Puntos Por Empate' });
  });

  it('falls back to the stored overrides when the ruleset cannot be compiled', () => {
    const { ruleset } = publicRuleset(
      descriptor,
      overriding({ 'not.a.declared.field': 'x', 'scoring.pointsPerWin': 2 }),
    );
    expect(ruleset).toEqual({ 'not.a.declared.field': 'x', 'scoring.pointsPerWin': '2' });
  });
});
