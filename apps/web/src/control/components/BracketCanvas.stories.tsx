import type { Meta, StoryObj } from '@storybook/react-vite';
import { BracketCanvas } from './BracketCanvas.js';
import {
  bracket,
  focusableBracket,
  fullyLinkedBracket,
  ids,
  mixedBracket,
} from './screen-story-fixtures.js';

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

/** Focused on an early, round-one match — scrolled into view and given the emphasis border. */
export const FocusedOnEarlyMatch: Story = {
  args: { focusMatchId: ids.match, matches: focusableBracket, matchUrl },
};

/** Focused on the round-two final — the same emphasis, later in the structure. */
export const FocusedOnLateMatch: Story = {
  args: { focusMatchId: ids.matchThree, matches: focusableBracket, matchUrl },
};

/** A focus target absent from the structure — renders normally, nothing emphasized, no error. */
export const FocusedOnUnrecognizedMatch: Story = {
  args: { focusMatchId: 'does-not-exist', matches: focusableBracket, matchUrl },
};
