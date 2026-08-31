import { applyTemplate, formatClock } from './matches-view.js';

describe('formatClock', () => {
  it('pads under a minute and lets minutes exceed 59', () => {
    expect(formatClock(46)).toBe('00:46');
    expect(formatClock(4726)).toBe('78:46');
  });

  it('floors a fractional second and clamps a negative one to zero', () => {
    expect(formatClock(90.9)).toBe('01:30');
    expect(formatClock(-5)).toBe('00:00');
  });
});

describe('applyTemplate', () => {
  it('substitutes every placeholder present in values', () => {
    expect(applyTemplate('{group} — position #{position}', { group: 'Grupo A', position: 2 })).toBe(
      'Grupo A — position #2',
    );
  });

  it('leaves a placeholder with no matching value untouched, rather than dropping it', () => {
    expect(applyTemplate('Elapsed time: {time}', {})).toBe('Elapsed time: {time}');
  });
});
