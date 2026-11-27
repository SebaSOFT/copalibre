import { jest } from '@jest/globals';
import { measureSchedule, animateSchedule } from './schedule-travel.js';

afterEach(() => {
  document.body.innerHTML = '';
  jest.restoreAllMocks();
});
it('travels from the measured position using motion tokens, with instantaneous reduced motion', () => {
  document.body.innerHTML =
    '<article data-schedule-match="match" style="--cl-motion-slow: 320ms; --cl-motion-easing: ease-out"></article>';
  const card = document.querySelector('article') as HTMLElement;
  const animate = jest.fn();
  Object.defineProperty(card, 'animate', { value: animate, configurable: true });
  const rect = jest
    .spyOn(card, 'getBoundingClientRect')
    .mockReturnValue({ left: 0, top: 0 } as DOMRect);
  const prior = measureSchedule();
  rect.mockReturnValue({ left: 100, top: 50 } as DOMRect);
  Object.defineProperty(window, 'matchMedia', {
    value: () => ({ matches: false }),
    configurable: true,
  });
  animateSchedule(prior);
  expect(animate).toHaveBeenCalledWith(
    [{ transform: 'translate(-100px, -50px)' }, { transform: 'translate(0, 0)' }],
    { duration: 320, easing: 'ease-out' },
  );
  animate.mockClear();
  Object.defineProperty(window, 'matchMedia', {
    value: () => ({ matches: true }),
    configurable: true,
  });
  animateSchedule(prior);
  expect(animate).not.toHaveBeenCalled();
});
it('handles missing measurements, unsupported animation and zero or missing duration', () => {
  document.body.innerHTML =
    '<article data-schedule-match="a"></article><article data-schedule-match="b"></article><article data-schedule-match="c"></article>';
  Object.defineProperty(window, 'matchMedia', {
    value: () => ({ matches: false }),
    configurable: true,
  });
  animateSchedule(new Map());
  const prior = measureSchedule();
  animateSchedule(prior);
  for (const card of document.querySelectorAll('article'))
    Object.defineProperty(card, 'animate', { value: jest.fn(), configurable: true });
  animateSchedule(prior);
  const card = document.querySelector('article') as HTMLElement;
  card.style.setProperty('--cl-motion-slow', '0s');
  animateSchedule(prior);
  expect(card.animate).not.toHaveBeenCalled();
  card.style.setProperty('--cl-motion-slow', '0.2s');
  animateSchedule(prior);
  expect(card.animate).toHaveBeenCalledWith(expect.any(Array), {
    duration: 200,
    easing: 'ease-out',
  });
});
