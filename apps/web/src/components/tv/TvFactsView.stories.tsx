import type { Meta, StoryObj } from '@storybook/react-vite';
import { TvFactsView } from './TvFactsView.js';

const meta = {
  title: 'TV/TvFactsView',
  component: TvFactsView,
  args: {
    facts: [
      { label: 'Partidos jugados', value: '24' },
      { label: 'Goles totales', value: '61', detail: '2.5 por partido' },
    ],
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TvFactsView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { facts: [] } };
