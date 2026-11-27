import { rescheduledStatement } from './reschedule.js';
it('states the date, time and changed venue in the active language', () => {
  const prior = {
    startsAt: Date.UTC(2026, 10, 7, 14, 30),
    venue: { alias: 'court-1', name: 'Cancha 1' },
  };
  expect(
    rescheduledStatement(prior, 'Cancha 2', 'es-AR', 'Reprogramado · antes {time}{venue}'),
  ).toContain('Cancha 1');
  expect(
    rescheduledStatement(prior, 'Cancha 1', 'de', 'Neu angesetzt · zuvor {time}{venue}'),
  ).not.toContain('Cancha 1');
  expect(
    rescheduledStatement({ ...prior, venue: null }, undefined, 'en', 'Was {time}{venue}'),
  ).toMatch(/^Was /);
  expect(rescheduledStatement(null, undefined, 'en', 'Was {time}{venue}')).toBe('');
  expect(rescheduledStatement(prior, undefined, 'en', undefined)).toBe('');
});
