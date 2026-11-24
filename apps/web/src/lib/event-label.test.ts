import { describe, expect, it } from '@jest/globals';
import type { LocalizedLabel } from '@copalibre/domain';
import { eventLabel } from './event-label.js';

describe('eventLabel', () => {
  it('prefers the page language in labels', () => {
    expect(
      eventLabel(
        {
          definitionCode: 'goal',
          label: 'Goal',
          labels: { en: 'Goal', es: 'Gol', fr: 'But' },
        },
        'es',
        'en',
      ),
    ).toBe('Gol');
  });

  it('falls back to the tournament primary language when the page language is missing', () => {
    expect(
      eventLabel(
        {
          definitionCode: 'goal',
          label: 'Goal',
          labels: { en: 'Goal', es: 'Gol' },
        },
        'fr',
        'es',
      ),
    ).toBe('Gol');
  });

  it('falls back to the first available label in the map via resolveLabel or object values', () => {
    expect(
      eventLabel(
        {
          definitionCode: 'goal',
          label: 'Fallback',
          labels: { en: 'Goal', pt: 'Gol' },
        },
        'de',
        'fr',
      ),
    ).toBe('Goal');

    expect(
      eventLabel(
        {
          definitionCode: 'goal',
          label: 'Fallback',
          labels: { fr: 'But' } as unknown as LocalizedLabel,
        },
        'de',
        'es',
      ),
    ).toBe('But');
  });

  it('falls back to event.label when labels is absent, then definitionCode, then empty string', () => {
    expect(eventLabel({ definitionCode: 'goal', label: 'Goal' }, 'es')).toBe('Goal');
    expect(eventLabel({ definitionCode: 'direct-free-kick-goal' }, 'es')).toBe(
      'direct-free-kick-goal',
    );
    expect(eventLabel({}, 'es')).toBe('');
  });
});
