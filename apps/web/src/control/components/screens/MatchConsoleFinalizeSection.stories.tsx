import type { Meta, StoryObj } from '@storybook/react-vite';
import { MatchConsoleFinalizeSection } from './MatchConsoleFinalizeSection.js';
import { consoleProjection } from '../screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/MatchConsoleFinalizeSection',
  component: MatchConsoleFinalizeSection,
  args: {
    canFinalize: true,
    confirmingFinalize: false,
    entrantById: new Map(consoleProjection.entrants.map((entrant) => [entrant.entrantId, entrant])),
    finalizePrimary: true,
    finalizeWinner: '',
    finalizing: false,
    handleCancelFinalize: () => undefined,
    handleConfirmFinalize: async () => undefined,
    projection: consoleProjection,
    setConfirmingFinalize: () => undefined,
    setFinalizeWinner: () => undefined,
  },
} satisfies Meta<typeof MatchConsoleFinalizeSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Start: Story = {};
/** The immutable-result confirmation, with the winner choice open. */
export const Confirming: Story = {
  args: {
    confirmingFinalize: true,
    finalizeWinner: consoleProjection.liveScores[0]?.entrantId ?? '',
  },
};
