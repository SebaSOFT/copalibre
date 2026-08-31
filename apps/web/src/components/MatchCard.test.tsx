import { render, screen } from '@testing-library/react';
import { MatchCard } from './MatchCard.js';
import type { MatchCardData } from '../lib/matches-view.js';
import type { MatchCardLabels } from '../lib/i18n/public-intl.js';

const labels: MatchCardLabels = {
  state: {
    live: 'LIVE',
    upcoming: 'UPCOMING',
    final: 'FINAL',
    disputed: 'DISPUTED',
    winner: 'WON',
    loser: 'LOST',
    tbd: 'TBD',
    cancelled: 'CANCELLED',
  },
  filters: { all: 'All', live: 'Live', upcoming: 'Upcoming', final: 'Final' },
  empty: 'No matches in this scope yet.',
  clockAriaLabel: 'Elapsed time: {time}',
  venueAriaLabel: 'Venue: {venue}',
  latestEventAriaLabel: 'Latest event: {event}',
  zoneGroupAriaLabel: 'Zone/group: {scope}',
  positionInGroup: '{group} — position #{position}',
  position: 'Position #{position}',
  decidedBy: 'Decided by: {factor}',
  decidedByAriaLabel: 'A full explanation is available to an authorized organizer.',
  fullTraceHeading: 'Full standings comparator trace',
  seriesAriaLabel: 'Best of {bestOf} series: {home} to {away}',
  seriesPending: 'Series undecided at {home}–{away}',
  seriesDecided: '{winner} won the series',
  seriesAggregate: 'On aggregate {home}–{away}',
};

function baseMatch(overrides: Partial<MatchCardData> = {}): MatchCardData {
  return {
    matchId: 'match-1',
    stageNumber: 1,
    matchNumber: 1,
    state: 'upcoming',
    homeName: 'Norte',
    awayName: 'Sur',
    ...overrides,
  };
}

describe('MatchCard', () => {
  it('shows a clock only while live', () => {
    const { rerender } = render(
      <MatchCard match={baseMatch({ state: 'live', clockSeconds: 4726 })} labels={labels} />,
    );
    expect(screen.getByTitle('Elapsed time: 78:46').textContent).toBe('78:46');

    rerender(<MatchCard match={baseMatch({ state: 'upcoming' })} labels={labels} />);
    expect(screen.queryByTitle(/Elapsed time/)).toBeNull();
  });

  it('omits the venue line when no venue is assigned', () => {
    const { rerender } = render(
      <MatchCard match={baseMatch({ venueName: 'Cancha 1' })} labels={labels} />,
    );
    expect(screen.getByTitle('Venue: Cancha 1').textContent).toBe('Cancha 1');

    rerender(<MatchCard match={baseMatch()} labels={labels} />);
    expect(screen.queryByTitle(/^Venue:/)).toBeNull();
  });

  it('shows a zone match with zone and position, and no series indication', () => {
    render(
      <MatchCard
        match={baseMatch({ zoneName: 'Group B', homePosition: 1, awayPosition: 2 })}
        labels={labels}
      />,
    );
    expect(screen.getByTitle('Zone/group: Group B').textContent).toBe('Group B');
    expect(screen.getByTitle('Position #1')).toBeDefined();
    expect(screen.getByTitle('Position #2')).toBeDefined();
    expect(screen.queryByText(/Series undecided|won the series/)).toBeNull();
  });

  it('renders a series cross via the series summary, with no position shown', () => {
    render(
      <MatchCard
        match={baseMatch({
          series: {
            span: 5,
            games: [{ number: 1, status: 'finalized', winner: 'home' }],
            homeGamesWon: 1,
            awayGamesWon: 0,
            status: 'undecided',
            explanation: 'undecided',
          },
        })}
        labels={labels}
      />,
    );
    expect(screen.getByText('Series undecided at 1–0')).toBeDefined();
    expect(screen.getByTitle('Best of 5 series: 1 to 0')).toBeDefined();
    expect(screen.queryByTitle(/^Position/)).toBeNull();
  });

  it('shows the deciding-factor line only when the response carries one', () => {
    const { rerender } = render(
      <MatchCard
        match={baseMatch({ state: 'final', decidingFactor: 'Rule 2 (Head-to-head)' })}
        labels={labels}
      />,
    );
    expect(screen.getByText('Decided by: Rule 2 (Head-to-head)')).toBeDefined();

    rerender(<MatchCard match={baseMatch({ state: 'final' })} labels={labels} />);
    expect(screen.queryByText(/^Decided by:/)).toBeNull();
  });

  it('never renders a trace panel when the response carries no trace (the public shape)', () => {
    render(<MatchCard match={baseMatch({ state: 'final' })} labels={labels} />);
    expect(screen.queryByText('Full standings comparator trace')).toBeNull();
  });

  it('renders the full trace panel when the response carries one (the control-web shape)', () => {
    render(
      <MatchCard
        match={baseMatch({
          state: 'final',
          homeTrace: [
            'Rule 1 (Points): tied → tied-proceed',
            'Rule 2 (Head-to-head): a=1 → resolved',
          ],
        })}
        labels={labels}
      />,
    );
    expect(screen.getByText('Full standings comparator trace')).toBeDefined();
    expect(screen.getByText('Rule 2 (Head-to-head): a=1 → resolved')).toBeDefined();
  });

  it('wraps the card in a link when reportUrl is given', () => {
    render(
      <MatchCard
        match={baseMatch()}
        labels={labels}
        reportUrl="/liga/tournaments/x/stages/1/matches/1"
      />,
    );
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      '/liga/tournaments/x/stages/1/matches/1',
    );
  });
});
