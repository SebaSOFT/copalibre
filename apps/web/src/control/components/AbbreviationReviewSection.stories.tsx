import type { Meta, StoryObj } from '@storybook/react-vite';
import { AbbreviationReviewSection } from './AbbreviationReviewSection.js';
import { ids, names } from './screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/AbbreviationReviewSection',
  component: AbbreviationReviewSection,
  args: {
    rows: [{ entrantId: ids.first, displayName: names[ids.first] }],
    onSetAbbreviation: async () => undefined,
  },
} satisfies Meta<typeof AbbreviationReviewSection>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { rows: [] } };
