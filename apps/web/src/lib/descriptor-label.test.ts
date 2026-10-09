import { describe, expect, it } from '@jest/globals';
import { descriptorLabel, humanizeCode } from './descriptor-label.ts';

describe('descriptorLabel', () => {
  const goal = { en: 'Goal', es: 'Gol' };

  it('uses the exact locale first', () => {
    expect(descriptorLabel({ en: 'Goal', 'pt-BR': 'Gol (BR)', pt: 'Golo' }, 'pt-BR', 'goal')).toBe(
      'Gol (BR)',
    );
  });

  it('uses the language of a regional locale', () => {
    expect(descriptorLabel({ en: 'Goal', pt: 'Golo' }, 'pt-BR', 'goal')).toBe('Golo');
  });

  it('shows the Spanish label on a Spanish page', () => {
    expect(descriptorLabel(goal, 'es', 'goal')).toBe('Gol');
  });

  it('falls back to English when the page language is missing', () => {
    expect(descriptorLabel(goal, 'de', 'goal')).toBe('Goal');
  });

  it('falls back to the first shipped label when English is absent', () => {
    expect(descriptorLabel({ es: 'Gol' }, 'de', 'goal')).toBe('Gol');
  });

  it('treats a plain string as the label in every language', () => {
    expect(descriptorLabel('Goal', 'es', 'goal')).toBe('Goal');
  });

  it('humanizes the code when there is no label at all', () => {
    expect(descriptorLabel(undefined, 'es', 'direct-free-kick-goal')).toBe('Direct free kick goal');
    expect(descriptorLabel({}, 'es', 'goalkeeper')).toBe('Goalkeeper');
  });
});

describe('humanizeCode', () => {
  it('turns separators into spaces and capitalizes the first word', () => {
    expect(humanizeCode('table-official')).toBe('Table official');
    expect(humanizeCode('assistant_referee')).toBe('Assistant referee');
  });
});
