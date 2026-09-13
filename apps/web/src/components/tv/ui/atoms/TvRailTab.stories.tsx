import type { Meta, StoryObj } from '@storybook/react-vite';
import { TvRailTab } from './TvRailTab.js';

const meta = {
  title: 'TV/TvRailTab',
  component: TvRailTab,
  args: {
    active: false,
    label: 'Tabla',
    onClick: () => undefined,
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TvRailTab>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Inactive: Story = {};
export const Active: Story = { args: { active: true } };
