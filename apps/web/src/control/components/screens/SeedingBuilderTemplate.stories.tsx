import type { Meta, StoryObj } from '@storybook/react-vite';
import { SeedingBuilderTemplate } from '../screens/SeedingBuilderTemplate.js';
import { ORG, TITLE, ids, names, bracket, qualifierSeeds } from '../screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/SeedingBuilderTemplate',
  component: SeedingBuilderTemplate,
  args: {
    organizationAlias: ORG,
    tournamentName: TITLE,
    zones: [{ matches: bracket }],
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
export const Empty: Story = { args: { seeds: [], zones: [] } };
export const LockedAfterResults: Story = { args: { hasRecordedResults: true } };
export const PartiallyAssigned: Story = {
  args: { seeds: [{ seed: 1, entrantId: ids.first, locked: false }] },
};

/** A reviewed promotion plan routes qualifiers here: the cup can be generated ahead of its groups. */
export const GenerateAhead: Story = {
  args: {
    seeds: [],
    zones: [],
    ahead: { zones: [{ format: 'single-elimination', seeds: qualifierSeeds }], generated: false },
  },
};

/** Generated ahead and waiting on the groups: the panel points at the confirmation. */
export const GeneratedAhead: Story = {
  args: {
    seeds: [],
    ahead: { zones: [{ format: 'single-elimination', seeds: qualifierSeeds }], generated: true },
  },
};
