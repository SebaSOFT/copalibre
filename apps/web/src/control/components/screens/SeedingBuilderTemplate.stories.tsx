import type { Meta, StoryObj } from '@storybook/react-vite';
import { SeedingBuilderTemplate } from '../screens/SeedingBuilderTemplate.js';
import { ORG, TITLE, ids, names, bracket } from '../screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/SeedingBuilderTemplate',
  component: SeedingBuilderTemplate,
  args: {
    organizationAlias: ORG,
    tournamentName: TITLE,
    matches: bracket,
    names,
    hasRecordedResults: false,
    random: () => 0.25,
    seeds: [
      { seed: 1, entrantId: ids.first, locked: true },
      { seed: 2, entrantId: ids.second, locked: false },
    ],
    onPublish: async () => undefined,
  },
} satisfies Meta<typeof SeedingBuilderTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { seeds: [], matches: [] } };
export const LockedAfterResults: Story = { args: { hasRecordedResults: true } };
export const PartiallyAssigned: Story = {
  args: { seeds: [{ seed: 1, entrantId: ids.first, locked: false }] },
};
