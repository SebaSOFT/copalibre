import type { Meta, StoryObj } from '@storybook/react-vite';
import { RegistrationReviewTemplate } from '../screens/RegistrationReviewTemplate.js';
import { ORG, TITLE, NOW, reviewRows } from '../screen-story-fixtures.js';
const meta = {
  title: 'Admin/Screens/RegistrationReviewTemplate',
  component: RegistrationReviewTemplate,
  args: { organizationAlias: ORG, tournamentName: TITLE, rows: reviewRows, now: NOW },
} satisfies Meta<typeof RegistrationReviewTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { rows: [] } };
