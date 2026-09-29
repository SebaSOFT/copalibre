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

describe('BracketCanvas series progress indicator', () => {
  const inProgressSeriesMatch: CanvasMatch = {
    matchId: 'WB-R1-M1',
    bracket: 'winners',
    round: 1,
    position: 1,
    status: 'in-progress',
    slots: [
      { kind: 'entrant', entrantId: 'team-a', score: 1 },
      { kind: 'entrant', entrantId: 'team-b', score: 0 },
    ],
    series: {
      span: 3,
      resolutionClass: 'best-of',
      status: 'undecided',
      homeGamesWon: 1,
      awayGamesWon: 0,
      explanation: 'Best-of-3 series stands at 1-0',
      games: [
        { number: 1, status: 'finalized', winner: 'home', scores: [2, 1] },
        { number: 2, status: 'scheduled' },
        { number: 3, status: 'scheduled' },
      ],
    },
  };

  const decidedSeriesMatch: CanvasMatch = {
    matchId: 'WB-R1-M2',
    bracket: 'winners',
    round: 1,
    position: 2,
    status: 'finalized',
    slots: [
      { kind: 'entrant', entrantId: 'team-c', score: 2 },
      { kind: 'entrant', entrantId: 'team-d', score: 0 },
    ],
    series: {
      span: 3,
      resolutionClass: 'best-of',
      status: 'decided',
      winner: 'home',
      winnerEntrantId: 'team-c',
      homeGamesWon: 2,
      awayGamesWon: 0,
      explanation: 'Best-of-3 series won by team-c (2-0)',
      games: [
        { number: 1, status: 'finalized', winner: 'home', scores: [3, 0] },
        { number: 2, status: 'finalized', winner: 'home', scores: [2, 1] },
        { number: 3, status: 'not-required' },
      ],
    },
  };

  const nonSeriesMatch: CanvasMatch = {
    matchId: 'WB-R1-M3',
    bracket: 'winners',
    round: 1,
    position: 3,
    status: 'scheduled',
    slots: [
      { kind: 'entrant', entrantId: 'team-e' },
      { kind: 'entrant', entrantId: 'team-f' },
    ],
  };

  it('renders series indicator for an in-progress series with score, pending label, and remaining legs', () => {
    render(withIntl(<BracketCanvas matches={[inProgressSeriesMatch]} zoom={1} />));

    const node = screen.getByText('WB-R1-M1').closest('[data-match]');
    expect(node).not.toBeNull();
    const indicator = node?.querySelector('[data-series-status]');
    expect(indicator).not.toBeNull();
    expect(indicator?.getAttribute('data-series-status')).toBe('undecided');

    expect(screen.getByText('Series: 1–0')).not.toBeNull();
    expect(screen.getByText('Pending')).not.toBeNull();
    expect(screen.getByTestId('series-remaining').textContent).toContain('Remaining: Legs 2, 3');
    expect(screen.queryByTestId('series-anulled')).toBeNull();
  });

  it('renders series indicator for a decided series with score, decided label, and anulled legs', () => {
    render(withIntl(<BracketCanvas matches={[decidedSeriesMatch]} zoom={1} />));

    const node = screen.getByText('WB-R1-M2').closest('[data-match]');
    expect(node).not.toBeNull();
    const indicator = node?.querySelector('[data-series-status]');
    expect(indicator).not.toBeNull();
    expect(indicator?.getAttribute('data-series-status')).toBe('decided');

    expect(screen.getByText('Series: 2–0')).not.toBeNull();
    expect(screen.getByText('Decided')).not.toBeNull();
    expect(screen.getByTestId('series-anulled').textContent).toContain('Anulled: Leg 3');
    expect(screen.queryByTestId('series-remaining')).toBeNull();
  });

  it('does not render series indicator for a non-series node', () => {
    render(withIntl(<BracketCanvas matches={[nonSeriesMatch]} zoom={1} />));

    const node = screen.getByText('WB-R1-M3').closest('[data-match]');
    expect(node).not.toBeNull();
    const indicator = node?.querySelector('[data-series-status]');
    expect(indicator).toBeNull();
    expect(screen.queryByText(/Series:/)).toBeNull();
  });

  it('distinguishes decided vs pending state using distinct text labels and data attributes without relying on colour alone', () => {
    render(
      withIntl(<BracketCanvas matches={[inProgressSeriesMatch, decidedSeriesMatch]} zoom={1} />),
    );

    const pendingNode = screen.getByText('WB-R1-M1').closest('[data-match]');
    const decidedNode = screen.getByText('WB-R1-M2').closest('[data-match]');

    const pendingIndicator = pendingNode?.querySelector('[data-series-status]');
    const decidedIndicator = decidedNode?.querySelector('[data-series-status]');

    // Structural attribute distinction
    expect(pendingIndicator?.getAttribute('data-series-status')).toBe('undecided');
    expect(decidedIndicator?.getAttribute('data-series-status')).toBe('decided');

    // Textual distinction (WCAG non-colour requirement)
    expect(pendingIndicator?.textContent).toContain('Pending');
    expect(decidedIndicator?.textContent).toContain('Decided');
    expect(pendingIndicator?.textContent).not.toContain('Decided');
    expect(decidedIndicator?.textContent).not.toContain('Pending');

    // Content distinction: pending announces remaining legs; decided announces anulled legs
    expect(pendingIndicator?.textContent).toContain('Remaining: Legs 2, 3');
    expect(decidedIndicator?.textContent).toContain('Anulled: Leg 3');
  });
});
