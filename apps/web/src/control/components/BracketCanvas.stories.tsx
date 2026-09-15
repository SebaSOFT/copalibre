import type { Meta, StoryObj } from '@storybook/react-vite';
import { BracketCanvas } from './BracketCanvas.js';
import { bracket, fullyLinkedBracket, mixedBracket } from './screen-story-fixtures.js';

const matchUrl = (persistedMatchId: string): string =>
  `/control/liga-mendocina/tournaments/apertura-2026/matches/${persistedMatchId}`;

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

/** A mix of linked (persisted) and pending nodes — round one links out, the final doesn't yet. */
export const MixedLinkedAndPending: Story = { args: { matches: mixedBracket, matchUrl } };

/** Every node in the round links to its match console — nothing left pending. */
export const FullyLinkedRound: Story = { args: { matches: fullyLinkedBracket, matchUrl } };
