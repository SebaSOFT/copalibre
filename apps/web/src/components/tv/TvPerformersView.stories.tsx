import type { Meta, StoryObj } from '@storybook/react-vite';
import { TvPerformersView } from './TvPerformersView.js';

const meta = {
  title: 'TV/TvPerformersView',
  component: TvPerformersView,
  args: {
    noTopPerformersLabel: 'No hay figuras destacadas todavía.',
    performers: [
      { rank: 1, name: 'A. Gutiérrez', clubName: 'CAI', statLabel: 'Goles', statValue: 9 },
      { rank: 2, name: 'M. Ferreyra', clubName: 'DSJ', statLabel: 'Goles', statValue: 7 },
    ],
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TvPerformersView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { performers: [] } };
