import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react';
import { publicIntl, tvDashboardLabels } from '../../../../lib/i18n/public-intl.js';
import type { LiveMatch } from '../../../../lib/live-state.js';
import { tvMatchProgress } from '../../../../lib/tv-match-progress.js';
import { TvLowerThird } from './TvLowerThird.js';

const labels = tvDashboardLabels(publicIntl('en'));
const clockLabels = { clockStopped: 'Stopped', clockAriaLabel: 'Game clock' };

function match(overrides: Partial<LiveMatch> = {}): LiveMatch {
  return {
    matchId: 'm1',
    stageNumber: 2,
    matchNumber: 5,
    stageOrdinal: 1,
    state: 'live',
    projectionVersion: 1,
    sides: [
      { entrantId: 'h', name: 'Casa de Italia', abbreviation: 'CIT', score: 2, state: 'live' },
      { entrantId: 'a', name: 'Richet y Zapata', abbreviation: 'RYZ', score: 1, state: 'live' },
    ],
    ...overrides,
  };
}

function renderBand(overrides: Partial<React.ComponentProps<typeof TvLowerThird>> = {}) {
  const live = match();
  return render(
    <TvLowerThird
      clockLabels={clockLabels}
      labels={labels}
      locale="en"
      match={live}
      progress={tvMatchProgress(live, undefined, 'en')}
      scope="Copa Oro · Semifinal"
      statusLabel="Live"
      statusTone="live"
      venueName="Cancha 1"
      {...overrides}
    />,
  );
}

describe('TvLowerThird', () => {
  it('lays out two rows: the teams and score, then the competition, court and state', () => {
    const { container } = renderBand();

    expect(container.querySelector('.tv-lower-third__teams')).not.toBeNull();
    const meta = container.querySelector('.tv-lower-third__meta');
    expect(meta?.textContent).toContain('Copa Oro · Semifinal');
    expect(meta?.textContent).toContain('Cancha 1');
    expect(meta?.textContent).toContain('Live');
  });

  it('shows the two abbreviations and the score of a live match', () => {
    const { container } = renderBand();
    const teams = container.querySelector('.tv-lower-third__teams')?.textContent ?? '';

    expect(teams).toContain('CIT');
    expect(teams).toContain('RYZ');
    expect(container.querySelector('.tv-lower-third__score')?.textContent).toContain(':');
  });

  it('shows an en-dash and the kickoff, never a score, for an upcoming match', () => {
    const { container } = renderBand({
      match: match({
        state: 'upcoming',
        scheduledAt: '2026-11-23T16:00:00.000Z',
        sides: match().sides.map((side) => ({ ...side, state: 'upcoming', score: 0 })),
      }),
      statusTone: 'upcoming',
      statusLabel: 'Upcoming',
    });

    expect(container.querySelector('.tv-lower-third__score')?.textContent).toBe('–');
    expect(container.querySelector('.tv-start-time')).not.toBeNull();
  });
});
