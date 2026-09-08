import type { TableProjectionResponse } from '@copalibre/api/src/dto/table-projections.dto.js';
import { buildTickerItems } from './ticker-items.js';
import { publicIntl, tickerLabels } from './i18n/public-intl.js';
import type { OverviewMatch } from './overview.js';

const labels = tickerLabels(publicIntl('en'));

const matches: readonly OverviewMatch[] = [
  {
    stageNumber: 1,
    matchNumber: 1,
    state: 'live',
    startsAt: '20:30',
    home: { name: 'Meridian Seven', score: 3 },
    away: { name: 'Ironclad Five', score: 1 },
  },
  {
    stageNumber: 1,
    matchNumber: 2,
    state: 'upcoming',
    startsAt: '22:00',
    home: { name: 'Obsidian Rift' },
    away: { name: 'Echo Squadron' },
  },
];

/** Football's own top-scorers layout: ranked by goals, not by the rank column. */
const footballScorers: TableProjectionResponse = {
  layoutCode: 'top-scorers',
  target: 'player-ranking',
  label: { en: 'Top scorers', es: 'Goleadores' },
  defaultSort: [{ columnCode: 'goals', direction: 'desc' }],
  projectionVersion: 3,
  columns: [
    { code: 'rank', header: { en: 'Rank', es: 'Puesto' }, format: 'number' },
    { code: 'goals', header: { en: 'Goals', es: 'Goles' }, format: 'number' },
  ],
  rows: [
    {
      actorId: 'player-1',
      entrantName: 'Lionel Messi',
      rank: 1,
      sharedRank: false,
      cells: { rank: { formatted: '1', raw: 1 }, goals: { formatted: '12', raw: 12 } },
    },
  ],
};

const groupedStandings: TableProjectionResponse = {
  layoutCode: 'group-standings-default',
  target: 'group-phase',
  label: { en: 'Group standings' },
  defaultSort: [{ columnCode: 'points', direction: 'desc' }],
  projectionVersion: 2,
  columns: [
    { code: 'rank', header: { en: 'Rank' }, format: 'number' },
    { code: 'points', header: { en: 'Points' }, format: 'number' },
  ],
  rows: [],
  segments: [
    {
      groupId: 'group-a',
      groupName: 'Group A',
      rows: [
        {
          actorId: 'entrant-1',
          entrantName: 'Vermilion Wolves',
          rank: 1,
          sharedRank: false,
          cells: { rank: { formatted: '1', raw: 1 }, points: { formatted: '9', raw: 9 } },
        },
      ],
    },
    {
      groupId: 'group-b',
      groupName: 'Group B',
      rows: [
        {
          actorId: 'entrant-2',
          entrantName: 'Aurora Vanguard',
          rank: 1,
          sharedRank: false,
          cells: { rank: { formatted: '1', raw: 1 }, points: { formatted: '7', raw: 7 } },
        },
      ],
    },
  ],
};

describe('buildTickerItems', () => {
  it('renders one item per supplied match', () => {
    const items = buildTickerItems({ matches, labels, language: 'en' });
    expect(items).toHaveLength(2);
    expect(items[0]?.subject).toBe('Meridian Seven');
    expect(items[0]?.opponent).toBe('Ironclad Five');
  });

  it('reads a played fixture as a score and an unplayed one as VS', () => {
    const items = buildTickerItems({ matches, labels, language: 'en' });
    expect(items[0]?.figure).toBe('3 : 1');
    expect(items[1]?.figure).toBe(labels.versus);
  });

  it('renders nothing rather than an empty rail when there is nothing to say', () => {
    expect(buildTickerItems({ matches: [], labels, language: 'en' })).toHaveLength(0);
  });

  it('takes a top performer from the discipline’s declared layout, ranked by its defaultSort', () => {
    const items = buildTickerItems({
      matches: [],
      performers: footballScorers,
      labels,
      language: 'en',
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe('performer');
    expect(items[0]?.badge).toBe('Top scorers');
    // The goals, not the rank — `columns[0]` is the rank column here.
    expect(items[0]?.figure).toBe('12');
    expect(items[0]?.meta).toBe('Goals');
  });

  it('speaks the reader’s language, because a discipline declares localized labels', () => {
    const items = buildTickerItems({
      matches: [],
      performers: footballScorers,
      labels,
      language: 'es',
    });
    expect(items[0]?.badge).toBe('Goleadores');
    expect(items[0]?.meta).toBe('Goles');
  });

  it('shows no top-performer item for a discipline that declares no player ranking', () => {
    // Tennis declares only a group-standings layout, so nothing is passed here.
    const items = buildTickerItems({ matches, labels, language: 'en' });
    expect(items.some((item) => item.kind === 'performer')).toBe(false);
  });

  it('yields one leader per group for a grouped stage', () => {
    const items = buildTickerItems({
      matches: [],
      leaders: groupedStandings,
      labels,
      language: 'en',
    });
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.badge)).toEqual(['Group A', 'Group B']);
    expect(items[0]?.subject).toBe('Vermilion Wolves');
    expect(items[0]?.figure).toBe('9');
  });

  it('yields one leader for a stage with no groups, so no format is left without one', () => {
    const ungrouped: TableProjectionResponse = {
      ...groupedStandings,
      segments: [
        {
          rows: [
            {
              actorId: 'entrant-3',
              entrantName: 'Kinetic Apex',
              rank: 1,
              sharedRank: false,
              cells: { rank: { formatted: '1', raw: 1 }, points: { formatted: '15', raw: 15 } },
            },
          ],
        },
      ],
    };
    const items = buildTickerItems({ matches: [], leaders: ungrouped, labels, language: 'en' });
    expect(items).toHaveLength(1);
    expect(items[0]?.badge).toBe(labels.leader);
    expect(items[0]?.subject).toBe('Kinetic Apex');
  });

  it('omits the meta when a fixture carries no kickoff time', () => {
    const items = buildTickerItems({
      matches: [
        {
          stageNumber: 1,
          matchNumber: 9,
          state: 'final',
          startsAt: '',
          home: { name: 'Neon Syndicate', score: 4 },
          away: { name: 'Solaris Prime', score: 4 },
        },
      ],
      labels,
      language: 'en',
    });
    expect(items[0]?.meta).toBeUndefined();
    expect(items[0]?.badge).toBe(labels.final);
    expect(items[0]?.tone).toBe('positive');
  });

  it('keys an unnumbered fixture by its position, since it has no number to key by', () => {
    const items = buildTickerItems({
      matches: [
        {
          stageNumber: 2,
          state: 'live',
          startsAt: '18:00',
          home: { name: 'Kinetic Apex', score: 1 },
          away: { name: 'Valkyrie Squad', score: 0 },
        },
      ],
      labels,
      language: 'en',
    });
    expect(items[0]?.key).toBe('match-2-0');
  });

  it('falls back to a rank when the projection could not name the competitor', () => {
    const anonymous: TableProjectionResponse = {
      ...footballScorers,
      rows: [{ actorId: 'player-9', rank: 4, sharedRank: false, cells: {} }],
    };
    const items = buildTickerItems({
      matches: [],
      performers: anonymous,
      leaders: { ...groupedStandings, segments: [{ rows: anonymous.rows }] },
      labels,
      language: 'en',
    });
    expect(items[0]?.subject).toBe('#4');
    // No cell for the ranked column at all: the figure reads zero, not blank.
    expect(items[0]?.figure).toBe('0');
    expect(items[1]?.subject).toBe('#4');
  });

  it('ranks by the last column when a layout declares no sort order of its own', () => {
    const unsorted: TableProjectionResponse = { ...footballScorers, defaultSort: [] };
    const items = buildTickerItems({
      matches: [],
      performers: unsorted,
      labels,
      language: 'en',
    });
    expect(items[0]?.figure).toBe('12');
  });

  it('skips a segment that ranked nobody', () => {
    const empty: TableProjectionResponse = {
      ...groupedStandings,
      segments: [{ groupId: 'group-c', groupName: 'Group C', rows: [] }],
    };
    expect(buildTickerItems({ matches: [], leaders: empty, labels, language: 'en' })).toHaveLength(
      0,
    );
  });

  it('contributes no leader items when no stage projection was fetched', () => {
    const items = buildTickerItems({ matches, labels, language: 'en' });
    expect(items.some((item) => item.kind === 'leader')).toBe(false);
  });
});
