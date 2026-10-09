import { describe, expect, it } from 'vitest';
import { eventLabelFields, rosterRolesOf } from './public-match-labels.js';

describe('eventLabelFields', () => {
  it('carries every declared language beside the English label', () => {
    expect(eventLabelFields({ label: { en: 'Goal', es: 'Gol' } }, 'goal')).toEqual({
      label: 'Goal',
      labels: { en: 'Goal', es: 'Gol' },
    });
  });

  it('keeps a plain-string label English-only', () => {
    expect(eventLabelFields({ label: 'Goal' }, 'goal')).toEqual({ label: 'Goal' });
  });

  it('falls back to the code for an event the descriptor does not declare', () => {
    expect(eventLabelFields(undefined, 'penalty-goal')).toEqual({ label: 'penalty-goal' });
  });
});

describe('rosterRolesOf', () => {
  it('lists the declared roles with their badge and label', () => {
    expect(
      rosterRolesOf({
        rosterRoles: [
          { code: 'goalkeeper', badge: 'GK', label: { en: 'Goalkeeper', es: 'Arquero' } },
          { code: 'captain', label: 'Captain' },
        ],
      }),
    ).toEqual([
      { code: 'goalkeeper', badge: 'GK', label: { en: 'Goalkeeper', es: 'Arquero' } },
      { code: 'captain', label: 'Captain' },
    ]);
  });

  it('is absent when the discipline declares no roster roles', () => {
    expect(rosterRolesOf({})).toBeUndefined();
  });
});
