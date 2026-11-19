import { jest } from '@jest/globals';
import {
  DEFERRED_STYLESHEET_META,
  addDeferredStylesheets,
  afterNextPaint,
} from './deferred-stylesheets.ts';

function frames(): { readonly flush: () => void } {
  const queue: FrameRequestCallback[] = [];
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    queue.push(callback);
    return queue.length;
  });
  return {
    flush: () => {
      for (const callback of queue.splice(0)) callback(0);
    },
  };
}

afterEach(() => {
  jest.restoreAllMocks();
  document.head.innerHTML = '';
});

describe('afterNextPaint', () => {
  it('waits two animation frames, then for the browser to be idle', () => {
    const { flush } = frames();
    const idle = jest.fn((callback: IdleRequestCallback) => {
      callback({ didTimeout: false, timeRemaining: () => 10 });
      return 1;
    });
    Object.defineProperty(window, 'requestIdleCallback', { value: idle, configurable: true });
    const then = jest.fn();

    afterNextPaint(then);
    flush();
    expect(then).not.toHaveBeenCalled();
    flush();
    expect(idle).toHaveBeenCalledWith(then, { timeout: 2000 });
    expect(then).toHaveBeenCalledTimes(1);

    Reflect.deleteProperty(window, 'requestIdleCallback');
  });

  it('falls back to a task where requestIdleCallback is missing', () => {
    jest.useFakeTimers();
    const { flush } = frames();
    const then = jest.fn();
    afterNextPaint(then);
    flush();
    flush();
    jest.runAllTimers();
    expect(then).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});

describe('addDeferredStylesheets', () => {
  it('adds each named stylesheet only once the page has painted', () => {
    jest.useFakeTimers();
    const { flush } = frames();
    document.head.innerHTML = `<meta name="${DEFERRED_STYLESHEET_META}" content="/_astro/fonts-deferred.css">`;

    addDeferredStylesheets();
    expect(document.querySelector('link[rel="stylesheet"]')).toBeNull();
    flush();
    flush();
    jest.runAllTimers();

    const link = document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]');
    expect(link?.getAttribute('href')).toBe('/_astro/fonts-deferred.css');
    jest.useRealTimers();
  });

  it('does nothing on a page that names none', () => {
    const animationFrame = jest.spyOn(window, 'requestAnimationFrame');
    addDeferredStylesheets();
    expect(animationFrame).not.toHaveBeenCalled();
  });
});
