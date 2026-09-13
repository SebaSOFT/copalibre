import type { Meta, StoryObj } from '@storybook/react-vite';
import { BracketCanvas } from './BracketCanvas.js';
import { bracket } from './screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/BracketCanvas',
  component: BracketCanvas,
  args: { matches: bracket, zoom: 1, onZoomChange: () => undefined },
} satisfies Meta<typeof BracketCanvas>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { matches: [] } };
export const Zoomed: Story = { args: { zoom: 1.5 } };
