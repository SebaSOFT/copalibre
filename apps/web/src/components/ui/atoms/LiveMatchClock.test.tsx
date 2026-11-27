import { jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server.node';
import { LiveMatchClock } from './LiveMatchClock.js';

const LABELS = {
  clockStopped: 'Stopped',
  clockAriaLabel: '{segment}, {time}',
};

describe('LiveMatchClock', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('matches server-rendered output on first render and advances only while running', () => {
    const clock = {
      segmentNumber: 1,
      elapsedSeconds: 125,
      running: true,
      asOf: '2026-04-01T18:02:05.000Z',
    };

    const serverHtml = renderToString(
      <LiveMatchClock clock={clock} labels={LABELS} segmentLabel="1st Half" variant="public" />,
    );
    expect(serverHtml).toContain('02:05');
    expect(serverHtml).toContain('1st Half');

    const { rerender } = render(
      <LiveMatchClock clock={clock} labels={LABELS} segmentLabel="1st Half" variant="public" />,
    );
    const timer = screen.getByRole('timer');
    expect(timer.textContent).toContain('02:05');
    expect(timer.getAttribute('aria-label')).toBe('1st Half, 02:05');

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.getByRole('timer').textContent).toContain('02:08');
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('1st Half, 02:08');

    rerender(
      <LiveMatchClock
        clock={{ ...clock, elapsedSeconds: 128, running: false }}
        labels={LABELS}
        segmentLabel="1st Half"
        variant="public"
      />,
    );
    expect(screen.getByRole('timer').textContent).toContain('02:08');
    expect(screen.getByText('Stopped')).toBeDefined();

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.getByRole('timer').textContent).toContain('02:08');
  });

  it('uses one shared page interval for multiple running clocks and stops it when paused or unmounted', () => {
    const setIntervalSpy = jest.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = jest.spyOn(globalThis, 'clearInterval');

    const { unmount } = render(
      <>
        <LiveMatchClock
          clock={{
            segmentNumber: 1,
            elapsedSeconds: 10,
            running: true,
            asOf: '2026-04-01T18:00:10.000Z',
          }}
          labels={LABELS}
          variant="public"
        />
        <LiveMatchClock
          clock={{
            segmentNumber: 2,
            elapsedSeconds: 20,
            running: true,
            asOf: '2026-04-01T18:00:20.000Z',
          }}
          labels={LABELS}
          variant="tv"
        />
        <LiveMatchClock
          clock={{
            segmentNumber: 1,
            elapsedSeconds: 50,
            running: false,
            asOf: '2026-04-01T18:00:50.000Z',
          }}
          labels={LABELS}
          variant="public"
        />
      </>,
    );

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    const timers = screen.getAllByRole('timer');
    expect(timers[0]?.textContent).toBe('00:12');
    expect(timers[1]?.textContent).toBe('00:22');
    expect(timers[2]?.textContent).toBe('00:50Stopped');

    unmount();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it('renders segment label only when clock is omitted for an untimed segment, or null when both absent', () => {
    const { container, rerender } = render(
      <LiveMatchClock labels={LABELS} segmentLabel="2nd Set" variant="public" />,
    );
    expect(screen.queryByRole('timer')).toBeNull();
    expect(container.textContent).toBe('2nd Set');

    rerender(<LiveMatchClock labels={LABELS} variant="public" />);
    expect(container.firstChild).toBeNull();
  });
});
