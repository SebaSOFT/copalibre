import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react';
import { publicIntl, tvDashboardLabels } from '../../../../lib/i18n/public-intl.js';
import type { LiveMatch } from '../../../../lib/live-state.js';
import { tvMatchProgress } from '../../../../lib/tv-match-progress.js';
import { TvOverlayBug } from './TvOverlayBug.js';

const labels = tvDashboardLabels(publicIntl('en'));
const clockLabels = { clockStopped: 'Stopped', clockAriaLabel: 'Game clock' };

function match(state: LiveMatch['state']): LiveMatch {
  return {
    matchId: 'm1',
    stageNumber: 1,
    matchNumber: 3,
    stageOrdinal: 3,
    state,
    projectionVersion: 1,
    sides: [
      { entrantId: 'h', name: 'Talleres', abbreviation: 'TAL', score: 2, state },
      { entrantId: 'a', name: 'Boca', abbreviation: 'BOC', score: 1, state },
    ],
  };
}

function renderBug(state: LiveMatch['state'], statusLabel: string) {
  const live = match(state);
  return render(
    <TvOverlayBug
      clockLabels={clockLabels}
      labels={labels}
      match={live}
      progress={tvMatchProgress(live, undefined, 'en')}
      statusLabel={statusLabel}
      statusTone={state}
    />,
  );
}

describe('TvOverlayBug states', () => {
  it('keeps the score of a disputed match, under its own state word', () => {
    const { container } = renderBug('disputed', labels.resultState.disputed);

    expect(container.querySelector('.tv-overlay-bug__score')?.textContent).toContain(':');
    expect(container.querySelector('.tv-scorebug__badge')?.textContent).toContain(
      labels.resultState.disputed,
    );
  });

  it('shows a dash, the cancelled word and no upcoming word for a cancelled match', () => {
    const { container } = renderBug('cancelled', labels.resultState.cancelled);

    expect(container.querySelector('.tv-overlay-bug__score')?.textContent).toBe('–');
    expect(container.querySelector('.tv-scorebug__badge')?.textContent).toContain(
      labels.resultState.cancelled,
    );
    expect(container.textContent).not.toContain(labels.resultState.upcoming);
  });
});
