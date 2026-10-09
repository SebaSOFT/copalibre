import { act, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { BroadcastAlertBanner, type BroadcastAlertItem } from './BroadcastAlertBanner.js';
import type { TvMatchEvent } from '../../../../lib/tv-match-events.js';

function event(overrides: Partial<TvMatchEvent> = {}): TvMatchEvent {
  return {
    eventId: 'ev-1',
    definitionCode: 'goal',
    label: 'Goal',
    occurredAt: '2026-08-19T12:00:00.000Z',
    ...overrides,
  };
}

function item(overrides: Partial<BroadcastAlertItem> = {}): BroadcastAlertItem {
  return { event: event(), kind: 'scoring', ...overrides };
}

function advance(ms: number): void {
  act(() => jest.advanceTimersByTime(ms));
}

describe('BroadcastAlertBanner', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('renders nothing while the queue is empty', () => {
    const { container } = render(
      <BroadcastAlertBanner awayLabel="Away" homeLabel="Home" onConsumed={jest.fn()} queue={[]} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing at the instant a new item is queued, entering only once its own timer fires', () => {
    render(
      <BroadcastAlertBanner
        awayLabel="Away"
        homeLabel="Home"
        onConsumed={jest.fn()}
        queue={[item({ event: event({ side: 'home', actor: '#9 Ada' }) })]}
      />,
    );
    expect(screen.queryByRole('status')).toBeNull();

    advance(0); // idle -> entering
    expect(screen.getByRole('status').className).toContain('tv-broadcast-alert--entering');
    expect(screen.getByText('Goal')).toBeDefined();
    expect(screen.getByText('Home')).toBeDefined();
    expect(screen.getByText('#9 Ada')).toBeDefined();

    advance(400); // entering -> showing
    expect(screen.getByRole('status').className).toContain('tv-broadcast-alert--showing');
  });

  it('calls onConsumed once the exit transition completes, using the full scoring duration', () => {
    const onConsumed = jest.fn();
    render(
      <BroadcastAlertBanner
        awayLabel="Away"
        homeLabel="Home"
        onConsumed={onConsumed}
        queue={[item({ kind: 'scoring' })]}
      />,
    );

    advance(0); // idle -> entering
    advance(400); // entering -> showing
    advance(5499); // just short of the scoring dwell
    expect(screen.getByRole('status').className).toContain('tv-broadcast-alert--showing');
    expect(onConsumed).not.toHaveBeenCalled();

    advance(1); // showing (scoring, 5500ms) -> exiting
    expect(screen.getByRole('status').className).toContain('tv-broadcast-alert--exiting');
    expect(onConsumed).not.toHaveBeenCalled();

    advance(300); // exiting -> gap, firing onConsumed on the way
    expect(onConsumed).toHaveBeenCalledWith('ev-1');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('uses the shorter notable duration for a non-scoring event', () => {
    const onConsumed = jest.fn();
    render(
      <BroadcastAlertBanner
        awayLabel="Away"
        homeLabel="Home"
        onConsumed={onConsumed}
        queue={[item({ kind: 'notable' })]}
      />,
    );

    advance(0); // idle -> entering
    advance(400); // entering -> showing
    advance(3999);
    expect(onConsumed).not.toHaveBeenCalled();
    advance(1); // showing (notable, 4000ms) -> exiting
    expect(screen.getByRole('status').className).toContain('tv-broadcast-alert--exiting');
    advance(300); // exiting -> gap
    expect(onConsumed).toHaveBeenCalledWith('ev-1');
  });

  it('pauses for a gap before accepting the next queued item', () => {
    const onConsumed = jest.fn();
    const { rerender } = render(
      <BroadcastAlertBanner
        awayLabel="Away"
        homeLabel="Home"
        onConsumed={onConsumed}
        queue={[item({ event: event({ eventId: 'ev-1' }) })]}
      />,
    );
    // Full lifecycle: idle -> entering -> showing -> exiting -> gap, one
    // phase transition per advance (a single combined advance can outrun
    // React's own effect scheduling for a chain this long).
    advance(0);
    advance(400);
    advance(5500);
    advance(300);
    expect(onConsumed).toHaveBeenCalledWith('ev-1');
    expect(screen.queryByRole('status')).toBeNull();

    // The caller drops the consumed item and queues the next one, mid-gap.
    rerender(
      <BroadcastAlertBanner
        awayLabel="Away"
        homeLabel="Home"
        onConsumed={onConsumed}
        queue={[item({ event: event({ eventId: 'ev-2', label: 'Card' }) })]}
      />,
    );
    expect(screen.queryByRole('status')).toBeNull();

    advance(499); // still within the 500ms gap
    expect(screen.queryByRole('status')).toBeNull();
    advance(1); // gap elapses -> idle
    advance(0); // idle -> entering
    expect(screen.getByText('Card')).toBeDefined();
  });

  it('marks the reduced-motion attribute when asked, without changing timing', () => {
    render(
      <BroadcastAlertBanner
        awayLabel="Away"
        homeLabel="Home"
        onConsumed={jest.fn()}
        prefersReducedMotion
        queue={[item()]}
      />,
    );
    advance(0);

    expect(screen.getByRole('status').getAttribute('data-reduced-motion')).toBe('');
  });
});
