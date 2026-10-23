import { render } from '@testing-library/react';
import { TvTeamSide } from './TvTeamSide.js';

describe('TvTeamSide', () => {
  it('matches the club emblem by id, never by display name', () => {
    const { container } = render(
      <TvTeamSide
        abbreviation="AAA"
        clubId="club-a"
        clubs={[{ clubId: 'club-b', name: 'Club A', emblemUrl: '/wrong-emblem.png' }]}
        name="Club A"
      />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.cl-entrant-emblem__monogram')?.textContent).toBe('AAA');
  });

  it('uses the matching club emblem when one is uploaded', () => {
    const { container } = render(
      <TvTeamSide
        abbreviation="AAA"
        clubId="club-a"
        clubs={[{ clubId: 'club-a', name: 'Club A', emblemUrl: '/club-a-emblem.png' }]}
        name="Club A"
      />,
    );

    expect(container.querySelector('img')?.getAttribute('src')).toBe('/club-a-emblem.png');
  });
});
