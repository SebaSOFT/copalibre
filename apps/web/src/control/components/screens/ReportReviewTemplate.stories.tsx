import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReportReviewTemplate } from '../screens/ReportReviewTemplate.js';
import { NOW, ids } from '../screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/ReportReviewTemplate',
  component: ReportReviewTemplate,
  args: {
    onDismiss: () => undefined,
    rows: [
      {
        reportId: ids.first,
        matchId: ids.match,
        kind: 'dispute',
        submittedByPersonId: ids.person,
        submittedAt: NOW,
        status: 'pending',
        evidence: [],
      },
    ],
    status: 'ready',
  },
} satisfies Meta<typeof ReportReviewTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { rows: [] } };
export const Loading: Story = { args: { rows: [], status: 'loading' } };
export const Failed: Story = { args: { rows: [], status: 'failed' } };
