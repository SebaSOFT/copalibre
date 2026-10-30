import { describe, expect, it } from '@jest/globals';
import { publicIntl } from './i18n/public-intl.js';
import { publicTableLayoutLabel } from './public-table-layout-label.js';

describe('publicTableLayoutLabel', () => {
  it('translates the first-party group standings label when its descriptor has no locale entry', () => {
    expect(
      publicTableLayoutLabel(
        {
          code: 'group-standings-default',
          target: 'group-phase',
          label: { en: 'Group Standings' },
        },
        publicIntl('de'),
      ),
    ).toBe('Gruppentabelle');
  });

  it('translates the first-party player statistics label when its descriptor has no locale entry', () => {
    expect(
      publicTableLayoutLabel(
        {
          code: 'player-statistics',
          target: 'player-ranking',
          label: { en: 'Player Statistics' },
        },
        publicIntl('de'),
      ),
    ).toBe('Spielerstatistiken');
  });

  it('translates the first-party player statistics label for other supported locales', () => {
    expect(
      publicTableLayoutLabel(
        {
          code: 'player-statistics',
          target: 'player-ranking',
          label: { en: 'Player Statistics' },
        },
        publicIntl('fr'),
      ),
    ).toBe('Statistiques des joueurs');
  });

  it('keeps explicit localized and organizer-provided labels unchanged', () => {
    expect(
      publicTableLayoutLabel(
        {
          code: 'group-standings-default',
          target: 'group-phase',
          label: { en: 'Group Standings', de: 'Gruppenübersicht' },
        },
        publicIntl('de'),
      ),
    ).toBe('Gruppenübersicht');
    expect(
      publicTableLayoutLabel(
        {
          code: 'top-scorers',
          target: 'player-ranking',
          label: { en: 'Top scorers' },
        },
        publicIntl('de'),
      ),
    ).toBe('Top scorers');
  });
});
