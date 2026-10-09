import type { Meta, StoryObj } from '@storybook/react-vite';
import { TvMatchList } from './TvMatchList.js';
import { publicIntl, tvDashboardLabels } from '../../../../lib/i18n/public-intl.js';
import { pageTvMatches, type TvMatchEntry } from '../../../../lib/tv-match-list.js';

const CLUBS = [
  ['LOM', 'Lomas de Rivadavia'],
  ['HIS', 'Club Hispano'],
  ['STA', 'Red Star'],
  ['BOG', 'Corazonistas Bogota'],
  ['UVT', 'Uvt'],
  ['SPA', 'Super Patin'],
] as const;

const ENTRIES: readonly TvMatchEntry[] = Array.from({ length: 30 }, (_, index) => {
  const home = CLUBS[index % CLUBS.length] ?? CLUBS[0];
  const away = CLUBS[(index + 1) % CLUBS.length] ?? CLUBS[1];
  return {
    key: `story-${index}`,
    scope: `Grupo A · Ronda ${Math.floor(index / 6) + 1}`,
    stateLabel: 'Finalizado',
    home: { label: home[0], name: home[1], score: (index * 3) % 7 },
    away: { label: away[0], name: away[1], score: (index * 5) % 6 },
  };
});

const meta = {
  title: 'TV/Kiosk & Full-Frame Widget/TvMatchList',
  component: TvMatchList,
  args: {
    labels: tvDashboardLabels(publicIntl('es')),
    page: 0,
    pages: pageTvMatches(ENTRIES),
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TvMatchList>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The first of two pages: twelve rows of two matches, the pager naming where it is. */
export const FirstPage: Story = {};

/** The last page holds what is left, and the pager says so. */
export const LastPage: Story = { args: { page: 1 } };
