import type { Meta, StoryObj } from '@storybook/react-vite';
import { TvStandingsTable } from './TvStandingsTable.js';

const meta = {
  title: 'TV/TvStandingsTable',
  component: TvStandingsTable,
  args: {
    dashboardLabels: {
      noMatchesScheduled: 'Sin partidos programados',
      standingsUnavailable: 'Tabla no disponible',
      clubColumn: 'Club',
      playedColumn: 'PJ',
      noTopPerformers: 'Sin figuras destacadas',
      focalPanelLabel: 'Panel principal',
      statsAndTablesLabel: 'Estadísticas y tablas',
      sidebarSectionsLabel: 'Secciones',
      standingsTab: 'Tabla',
      performersTab: 'Figuras',
      statisticsTab: 'Estadísticas',
    },
    pointsShortLabel: 'Pts',
    standings: [
      {
        position: 1,
        name: 'Club Atlético Independiente',
        abbreviation: 'CAI',
        played: 8,
        points: 19,
      },
      { position: 2, name: 'Deportivo San Juan', abbreviation: 'DSJ', played: 8, points: 17 },
    ],
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TvStandingsTable>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Unavailable: Story = { args: { standings: [] } };
