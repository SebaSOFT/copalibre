import { jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('marks the focused node (by its persisted match id) and scrolls it into view on mount', () => {
    const scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    render(withIntl(<BracketCanvas focusMatchId="persisted-match-1" matches={matches} zoom={1} />));

    const focusedNode = screen.getByText('WB-R1-M1').closest('[data-match]');
    expect(focusedNode?.getAttribute('data-focused')).toBe('true');
    expect(screen.getByText('WB-R2-M1').closest('[data-match]')?.getAttribute('data-focused')).toBe(
      null,
    );
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('renders normally with nothing emphasized when focusMatchId matches no node', () => {
    render(withIntl(<BracketCanvas focusMatchId="does-not-exist" matches={matches} zoom={1} />));

    expect(screen.getByText('WB-R1-M1').closest('[data-match]')?.getAttribute('data-focused')).toBe(
      null,
    );
    expect(screen.getByText('WB-R2-M1').closest('[data-match]')?.getAttribute('data-focused')).toBe(
      null,
    );
  });

  it('leaves every node unfocused when focusMatchId is not supplied, including an unmaterialized one', () => {
    render(withIntl(<BracketCanvas matches={matches} zoom={1} />));

    expect(screen.getByText('WB-R1-M1').closest('[data-match]')?.getAttribute('data-focused')).toBe(
      null,
    );
    expect(screen.getByText('WB-R2-M1').closest('[data-match]')?.getAttribute('data-focused')).toBe(
      null,
    );
  });
});

it('toggles journey selection without nesting buttons inside report links', () => {
  const callback = jest.fn();
  const { rerender } = render(
    withIntl(
      <BracketCanvas
        matches={matches}
        zoom={1}
        onHighlightEntrant={callback}
        matchUrl={() => '/report'}
      />,
    ),
  );
  const button = screen.getByRole('button', { name: 'Highlight path for entrant-1' });
  expect(button.closest('a')).toBeNull();
  fireEvent.click(button);
  expect(callback).toHaveBeenLastCalledWith('entrant-1');
  rerender(
    withIntl(
      <BracketCanvas
        matches={matches}
        zoom={1}
        highlightEntrantId="entrant-1"
        onHighlightEntrant={callback}
      />,
    ),
  );
  expect(
    screen.getByText('WB-R2-M1').closest('[data-match]')?.getAttribute('data-entrant-path'),
  ).toBe('included');
  expect(button.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(button);
  expect(callback).toHaveBeenLastCalledWith(undefined);
  fireEvent.keyDown(button, { key: 'Escape' });
  expect(callback).toHaveBeenLastCalledWith(undefined);
});
