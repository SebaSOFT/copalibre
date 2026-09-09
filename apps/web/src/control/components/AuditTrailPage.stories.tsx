import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { AuditTrailPage } from './AuditTrailPage.js';
import { messages } from '../i18n/messages.en.js';
import { ORG, auditRecords } from './screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/AuditTrailPage',
  component: AuditTrailPage,
  args: {
    organizationAlias: ORG,
    records: auditRecords,
    loading: false,
    total: 1,
    limit: 10,
    offset: 0,
    actorFilter: '',
    onActorFilterChange: () => undefined,
    onPreviousPage: () => undefined,
    onNextPage: () => undefined,
  },
} satisfies Meta<typeof AuditTrailPage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { records: [], total: 0 } };
export const Loading: Story = { args: { loading: true } };
export const Failed: Story = {
  render: function Render(args) {
    const intl = useIntl();
    return <AuditTrailPage {...args} error={intl.formatMessage(messages.auditTrailLoadFailed)} />;
  },
};
export const NextPage: Story = { args: { offset: 10, total: 25 } };
