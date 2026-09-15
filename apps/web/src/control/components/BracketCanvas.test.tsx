import { render, screen } from '@testing-library/react';
import { BracketCanvas } from './BracketCanvas.js';
import { withIntl } from '../i18n/test-support.js';
import type { CanvasMatch } from '../lib/bracket-canvas.js';

const matches: readonly CanvasMatch[] = [
  {
    matchId: 'WB-R1-M1',
    persistedMatchId: 'persisted-match-1',
    bracket: 'winners',
    round: 1,
    position: 1,
    status: 'scheduled',
    slots: [
      { kind: 'entrant', entrantId: 'entrant-1' },
      { kind: 'entrant', entrantId: 'entrant-2' },
    ],
  },
  {
    matchId: 'WB-R2-M1',
    bracket: 'winners',
    round: 2,
    position: 1,
    status: 'scheduled',
    slots: [
      { kind: 'winner-of', matchId: 'WB-R1-M1' },
      { kind: 'winner-of', matchId: 'WB-R1-M2' },
    ],
  },
];

describe('BracketCanvas', () => {
  it('links a node with a persisted match id to the URL matchUrl builds', () => {
    render(
      withIntl(
        <BracketCanvas
          matches={matches}
          matchUrl={(persistedMatchId) => `/control/org/tournaments/t/matches/${persistedMatchId}`}
          zoom={1}
        />,
      ),
    );

    const link = screen.getByText('WB-R1-M1').closest('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/control/org/tournaments/t/matches/persisted-match-1');
  });

  it('leaves a not-yet-materialized node with no link', () => {
    render(
      withIntl(
        <BracketCanvas
          matches={matches}
          matchUrl={(persistedMatchId) => `/control/org/tournaments/t/matches/${persistedMatchId}`}
          zoom={1}
        />,
      ),
    );

    const pendingArticle = screen.getByText('WB-R2-M1').closest('article');
    expect(pendingArticle?.closest('a')).toBeNull();
  });

  it('renders no links when matchUrl is not supplied, even for a persisted node', () => {
    render(withIntl(<BracketCanvas matches={matches} zoom={1} />));

    expect(screen.getByText('WB-R1-M1').closest('a')).toBeNull();
  });
});
