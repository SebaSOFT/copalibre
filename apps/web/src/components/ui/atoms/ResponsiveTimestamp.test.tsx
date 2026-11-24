import { jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react';
import { ResponsiveTimestamp } from './ResponsiveTimestamp.js';

/**
 * Renders in the machine's own local timezone by design — that's what makes
 * "same day" mean the viewer's day, not the server's — so expectations are
 * computed the same way the atom computes them, never hardcoded against a
 * specific offset.
 */
function localTime(iso: string): string {
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

function localDateOnly(iso: string): string {
  const parts = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).formatToParts(
    new Date(iso),
  );
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  return `${day}-${month}`;
}

describe('ResponsiveTimestamp', () => {
  const sameDayTimestamp = '2026-09-04T14:30:00.000Z';
  const referenceDate = new Date('2026-09-04T12:00:00.000Z');
  const otherDayTimestamp = '2025-11-02T14:30:00.000Z';

  it('renders same-day timestamps as Today HH:mm', () => {
    render(
      <ResponsiveTimestamp
        locale="en"
        referenceDate={referenceDate}
        timestamp={sameDayTimestamp}
      />,
    );
    expect(screen.getByText(`Today ${localTime(sameDayTimestamp)}`).tagName).toBe('TIME');
  });

  it('renders a different-day timestamp as d-MMM HH:mm', () => {
    render(
      <ResponsiveTimestamp
        locale="en"
        referenceDate={referenceDate}
        timestamp={otherDayTimestamp}
      />,
    );
    const expected = `${localDateOnly(otherDayTimestamp)} ${localTime(otherDayTimestamp)}`;
    expect(screen.getByText(expected).tagName).toBe('TIME');
  });

  it('emits a semantic <time> element with the ISO instant and a localized title', () => {
    render(
      <ResponsiveTimestamp
        locale="en"
        referenceDate={referenceDate}
        timestamp={sameDayTimestamp}
      />,
    );
    const el = screen.getByText(`Today ${localTime(sameDayTimestamp)}`);
    expect(el.getAttribute('dateTime')).toBe(sameDayTimestamp);
    expect(el.getAttribute('title')).toBeTruthy();
  });

  it('supports a fixed time-only format regardless of day', () => {
    const timestamp = '2025-01-01T09:05:00.000Z';
    render(<ResponsiveTimestamp format="time-only" locale="en" timestamp={timestamp} />);
    expect(screen.getByText(localTime(timestamp))).toBeTruthy();
  });

  it('supports a date-only format', () => {
    render(<ResponsiveTimestamp format="date-only" locale="en" timestamp={otherDayTimestamp} />);
    expect(screen.getByText(localDateOnly(otherDayTimestamp))).toBeTruthy();
  });

  describe('format="relative"', () => {
    it('formats recent events (<45s) as just now / hace un momento', () => {
      const recent = new Date(referenceDate.getTime() - 10_000).toISOString();
      const { rerender } = render(
        <ResponsiveTimestamp
          format="relative"
          locale="es"
          referenceDate={referenceDate}
          timestamp={recent}
        />,
      );
      expect(screen.getByText('hace un momento')).toBeTruthy();

      rerender(
        <ResponsiveTimestamp
          format="relative"
          locale="en"
          referenceDate={referenceDate}
          timestamp={recent}
        />,
      );
      expect(screen.getByText('just now')).toBeTruthy();
    });

    it('formats minute differences', () => {
      const fiveMinsAgo = new Date(referenceDate.getTime() - 5 * 60 * 1000).toISOString();
      render(
        <ResponsiveTimestamp
          format="relative"
          locale="en"
          referenceDate={referenceDate}
          timestamp={fiveMinsAgo}
        />,
      );
      expect(screen.getByText('5 minutes ago')).toBeTruthy();
    });

    it('formats hour differences', () => {
      const twoHoursAgo = new Date(referenceDate.getTime() - 2 * 3600 * 1000).toISOString();
      render(
        <ResponsiveTimestamp
          format="relative"
          locale="en"
          referenceDate={referenceDate}
          timestamp={twoHoursAgo}
        />,
      );
      expect(screen.getByText('2 hours ago')).toBeTruthy();
    });

    it('formats day differences', () => {
      const threeDaysAgo = new Date(referenceDate.getTime() - 3 * 86_400 * 1000).toISOString();
      render(
        <ResponsiveTimestamp
          format="relative"
          locale="en"
          referenceDate={referenceDate}
          timestamp={threeDaysAgo}
        />,
      );
      expect(screen.getByText('3 days ago')).toBeTruthy();
    });
  });

  it('renders a malformed value verbatim instead of throwing', () => {
    render(<ResponsiveTimestamp locale="en" timestamp="not-a-date" />);
    expect(screen.getByText('not-a-date')).toBeTruthy();
  });

  describe('shared minute-tick updates', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('shares one 60-second interval across instances, updates across midnight, and cleans up on unmount', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-11-23T23:59:30.000Z'));

      const { unmount } = render(
        <>
          <ResponsiveTimestamp
            locale="en"
            referenceDate={new Date('2026-11-23T23:59:30.000Z')}
            timestamp="2026-11-23T20:00:00.000Z"
            timeZone="UTC"
          />
          <ResponsiveTimestamp
            locale="en"
            referenceDate={new Date('2026-11-23T23:59:30.000Z')}
            timestamp="2026-11-24T10:00:00.000Z"
            timeZone="UTC"
          />
        </>,
      );

      expect(screen.getByText('Today 20:00')).toBeTruthy();
      expect(screen.getByText('Tomorrow 10:00')).toBeTruthy();
      // One shared module-level interval for both mounted atoms.
      expect(jest.getTimerCount()).toBe(1);

      act(() => {
        jest.advanceTimersByTime(60_000);
      });

      expect(screen.getByText('Yesterday 20:00')).toBeTruthy();
      expect(screen.getByText('Today 10:00')).toBeTruthy();

      unmount();
      expect(jest.getTimerCount()).toBe(0);
    });

    it('skips re-renders when the formatted output does not change on tick and does not schedule intervals for fixed formats', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-11-23T12:00:00.000Z'));

      const { unmount: unmountFixed } = render(
        <ResponsiveTimestamp
          format="time-only"
          locale="en"
          timestamp="2026-11-23T20:00:00.000Z"
          timeZone="UTC"
        />,
      );
      expect(jest.getTimerCount()).toBe(0);
      unmountFixed();

      const { rerender, unmount } = render(
        <ResponsiveTimestamp
          locale="en"
          referenceDate={new Date('2026-11-23T12:00:00.000Z')}
          timestamp="2026-11-23T20:00:00.000Z"
          timeZone="UTC"
        />,
      );
      const timeEl = screen.getByText('Today 20:00');
      act(() => {
        jest.advanceTimersByTime(60_000);
      });
      // Text stayed "Today 20:00" -> same element, no change.
      expect(screen.getByText('Today 20:00')).toBe(timeEl);

      // Prop changes reflect immediately without waiting for the next minute tick.
      rerender(
        <ResponsiveTimestamp
          locale="es"
          referenceDate={new Date('2026-11-23T12:00:00.000Z')}
          timestamp="2026-11-23T20:00:00.000Z"
          timeZone="UTC"
        />,
      );
      expect(screen.getByText('Hoy 20:00')).toBeTruthy();
      unmount();
    });
  });
});
