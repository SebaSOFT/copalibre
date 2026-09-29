import type { Meta, StoryObj } from '@storybook/react-vite';
import { TvTeamSide } from './TvTeamSide.js';

const meta = {
  title: 'TV/Kiosk & Full-Frame Widget/TvTeamSide',
  component: TvTeamSide,
  args: {
    name: 'Club Atlético Independiente',
    abbreviation: 'CAI',
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TvTeamSide>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Monogram: Story = {};
export const WithEmblem: Story = {
  args: {
    clubs: [{ name: 'Club Atlético Independiente', emblemObjectId: 'obj-1' }],
  },
};
