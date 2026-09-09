import type { Meta, StoryObj } from '@storybook/react-vite';
import { RegistrationReviewPage } from './RegistrationReviewPage.js';
import { ORG, TITLE, NOW, reviewRows } from './screen-story-fixtures.js';
const meta = {
  title: 'Admin/Screens/RegistrationReviewPage',
  component: RegistrationReviewPage,
  args: { organizationAlias: ORG, tournamentName: TITLE, rows: reviewRows, now: NOW },
} satisfies Meta<typeof RegistrationReviewPage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { rows: [] } };
