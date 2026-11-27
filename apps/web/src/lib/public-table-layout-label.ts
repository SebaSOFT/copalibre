import type { TableLayoutSummaryResponse } from '@copalibre/api/src/dto/table-projections.dto.js';
import type { IntlShape } from 'react-intl';
import { localizedText } from './localized-label.js';
import { messages } from './i18n/public-messages.en.js';

type PublicTableLayoutLabel = Pick<TableLayoutSummaryResponse, 'code' | 'target' | 'label'>;

const DEFAULT_LAYOUT_LABELS = {
  'group-standings-default': {
    target: 'group-phase',
    english: 'Group Standings',
    message: messages.standingsDefaultGroupLayout,
  },
  'player-statistics': {
    target: 'player-ranking',
    english: 'Player Statistics',
    message: messages.standingsDefaultPlayerStatisticsLayout,
  },
} as const;

/** Translate first-party default layout names while preserving organizer-provided labels. */
export function publicTableLayoutLabel(layout: PublicTableLayoutLabel, intl: IntlShape): string {
  const defaultLabel = DEFAULT_LAYOUT_LABELS[layout.code as keyof typeof DEFAULT_LAYOUT_LABELS];
  const englishLabel = typeof layout.label === 'string' ? layout.label : layout.label.en;
  const locale = intl.locale.split('-')[0] ?? intl.locale;
  const hasLocaleLabel =
    typeof layout.label !== 'string' &&
    Object.hasOwn(layout.label as Record<string, string>, locale);

  if (
    !hasLocaleLabel &&
    defaultLabel !== undefined &&
    defaultLabel.target === layout.target &&
    englishLabel === defaultLabel.english &&
    locale !== 'en'
  ) {
    return intl.formatMessage(defaultLabel.message);
  }

  return localizedText(layout.label, intl.locale);
}
