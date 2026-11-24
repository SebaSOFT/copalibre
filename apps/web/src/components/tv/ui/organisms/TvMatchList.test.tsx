import { render, screen } from '@testing-library/react';
import { publicIntl, tvDashboardLabels } from '../../../../lib/i18n/public-intl.js';
import type { TvMatchEntry } from '../../../../lib/tv-match-list.js';
import { TvMatchList } from './TvMatchList.js';

const labels = tvDashboardLabels(publicIntl('en'));

describe('TvMatchList', () => {
  it('formats scheduled times with the short dynamic format and renders a visible delayed badge', () => {
    const referenceDate = Date.parse('2026-08-01T18:20:00.000Z');
    const entries: readonly TvMatchEntry[] = [
      {
        key: 'm-delayed',
        scope: 'Group A · Round 1',
        stateLabel: 'Delayed',
        delayed: true,
        scheduledAt: '2026-08-01T18:00:00.000Z',
        home: { label: 'NOR', name: 'Norte', abbreviation: 'NOR' },
        away: { label: 'SUR', name: 'Sur', abbreviation: 'SUR' },
      },
      {
        key: 'm-future',
        scope: 'Group A · Round 2',
        stateLabel: 'Upcoming',
        scheduledAt: '2026-08-05T20:00:00.000Z',
        home: { label: 'EST', name: 'Este', abbreviation: 'EST' },
        away: { label: 'OES', name: 'Oeste', abbreviation: 'OES' },
      },
    ];

    const { container } = render(
      <TvMatchList
        labels={labels}
        locale="en"
        page={0}
        pages={[[entries]]}
        referenceDate={referenceDate}
        timeZone="UTC"
      />,
    );

    const rows = container.querySelectorAll('.tv-match-list__entry');
    expect(rows[0]?.textContent).toContain('Today 18:00');
    expect(rows[0]?.querySelector('.cl-badge.cl-state--delayed')?.textContent).toBe('Delayed');
    expect(rows[1]?.textContent).toContain('5-Aug 20:00');
    expect(rows[1]?.querySelector('.cl-badge.cl-state--delayed')).toBeNull();
    expect(screen.getByText('Delayed')).toBeDefined();
  });
});
