import { describe, expect, it } from '@jest/globals';
import { DELAYED_AFTER_MINUTES, isDelayed } from './match-state.js';

describe('isDelayed', () => {
  const kickoff = '2026-11-23T14:00:00.000Z';
  const kickoffMs = Date.parse(kickoff);

  it('uses a 15-minute grace period', () => {
    expect(DELAYED_AFTER_MINUTES).toBe(15);
  });

  it('is false at +14 minutes and +15 minutes, and true at +16 minutes', () => {
    expect(isDelayed({ state: 'upcoming', scheduledAt: kickoff }, kickoffMs + 14 * 60_000)).toBe(
      false,
    );
    expect(isDelayed({ state: 'upcoming', scheduledAt: kickoff }, kickoffMs + 15 * 60_000)).toBe(
      false,
    );
    expect(
      isDelayed({ state: 'upcoming', scheduledAt: kickoff }, kickoffMs + 15 * 60_000 + 1),
    ).toBe(true);
    expect(
      isDelayed({ state: 'upcoming', scheduledAt: kickoff }, new Date(kickoffMs + 16 * 60_000)),
    ).toBe(true);
  });

  it('falls back to startsAt when scheduledAt is absent', () => {
    expect(isDelayed({ state: 'upcoming', startsAt: kickoff }, kickoffMs + 16 * 60_000)).toBe(true);
  });

  it('is never true for live, final, or disputed matches', () => {
    const past = kickoffMs + 60 * 60_000;
    expect(isDelayed({ state: 'live', scheduledAt: kickoff }, past)).toBe(false);
    expect(isDelayed({ state: 'final', scheduledAt: kickoff }, past)).toBe(false);
    expect(isDelayed({ state: 'disputed', scheduledAt: kickoff }, past)).toBe(false);
  });

  it('is false when kickoff is missing, null, empty, or invalid', () => {
    const past = kickoffMs + 60 * 60_000;
    expect(isDelayed({ state: 'upcoming' }, past)).toBe(false);
    expect(isDelayed({ state: 'upcoming', scheduledAt: null, startsAt: null }, past)).toBe(false);
    expect(isDelayed({ state: 'upcoming', scheduledAt: '' }, past)).toBe(false);
    expect(isDelayed({ state: 'upcoming', scheduledAt: 'not-a-date' }, past)).toBe(false);
  });
});
