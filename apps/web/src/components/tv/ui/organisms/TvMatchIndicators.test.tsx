import { jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { TvMatchIndicators } from './TvMatchIndicators.js';
import type { LiveMatch } from '../../../../lib/live-state.js';

function match(overrides: Partial<LiveMatch> = {}): LiveMatch {
  return {
    matchId: 'm1',
    stageNumber: 1,
    matchNumber: 1,
    state: 'live',
    projectionVersion: 1,
    sides: [
      { entrantId: 'e1', name: 'Boca Juniors', abbreviation: 'BOC', score: 1, state: 'live' },
      { entrantId: 'e2', name: 'River Plate', abbreviation: 'RIV', score: 0, state: 'live' },
    ],
    ...overrides,
  };
}

describe('TvMatchIndicators', () => {
  it('renders nothing when no possession or penalty facts are projected', () => {
    const { container } = render(
      <TvMatchIndicators match={match()} possessionLabel="Possession" penaltyLabel="Penalty" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the match is undefined', () => {
    const { container } = render(
      <TvMatchIndicators possessionLabel="Possession" penaltyLabel="Penalty" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('identifies the possession side without a percentage', () => {
    render(
      <TvMatchIndicators
        match={match({ possessionEntrantId: 'e1' })}
        possessionLabel="Possession"
        penaltyLabel="Penalty"
      />,
    );
    const indicator = screen.getByTestId('tv-match-indicators');
    expect(indicator.textContent).toContain('Possession');
    expect(indicator.textContent).toContain('BOC');
    expect(indicator.textContent).not.toMatch(/%/);
  });

  it('omits a possession indicator whose entrant is not a participating side', () => {
    const { container } = render(
      <TvMatchIndicators
        match={match({ possessionEntrantId: 'someone-else' })}
        possessionLabel="Possession"
        penaltyLabel="Penalty"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows an active timed penalty with its remaining time', () => {
    render(
      <TvMatchIndicators
        match={match({
          activePenalties: [{ timerId: 't1', entrantId: 'e2', remainingSeconds: 125 }],
        })}
        possessionLabel="Possession"
        penaltyLabel="Penalty"
      />,
    );
    const indicator = screen.getByTestId('tv-match-indicators');
    expect(indicator.textContent).toContain('Penalty');
    expect(indicator.textContent).toContain('RIV');
    expect(indicator.textContent).toContain('02:05');
  });

  it('counts a timed penalty down and removes it at expiry without a reload', () => {
    jest.useFakeTimers();
    try {
      render(
        <TvMatchIndicators
          match={match({
            activePenalties: [{ timerId: 't1', entrantId: 'e2', remainingSeconds: 2 }],
          })}
          possessionLabel="Possession"
          penaltyLabel="Penalty"
        />,
      );
      expect(screen.getByTestId('tv-match-indicators').textContent).toContain('00:02');

      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.getByTestId('tv-match-indicators').textContent).toContain('00:01');

      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.queryByTestId('tv-match-indicators')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('drops a manually resolved penalty once the projection stops reporting its timer', () => {
    const { rerender } = render(
      <TvMatchIndicators
        match={match({
          activePenalties: [{ timerId: 't1', entrantId: 'e2', remainingSeconds: 90 }],
        })}
        possessionLabel="Possession"
        penaltyLabel="Penalty"
      />,
    );
    expect(screen.getByTestId('tv-match-indicators').textContent).toContain('RIV');

    rerender(
      <TvMatchIndicators
        match={match({ activePenalties: [] })}
        possessionLabel="Possession"
        penaltyLabel="Penalty"
      />,
    );
    expect(screen.queryByTestId('tv-match-indicators')).toBeNull();
  });
});
