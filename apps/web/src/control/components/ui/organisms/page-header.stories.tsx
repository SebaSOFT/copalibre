import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { Button } from '../atoms/button.js';
import { PageHeader } from './page-header.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Organisms/PageHeader',
  component: PageHeader,
  args: { title: '', loadingLabel: '', breadcrumbLabel: '' },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <PageHeader
        actions={<Button variant="primary">{intl.formatMessage(storyText.save)}</Button>}
        breadcrumbLabel={intl.formatMessage(storyText.rolesTitle)}
        breadcrumbs={[
          { label: intl.formatMessage(storyText.platformTitle), href: '#' },
          { label: intl.formatMessage(storyText.tournaments), current: true },
        ]}
        description={intl.formatMessage(storyText.tournaments)}
        loadingLabel={intl.formatMessage(storyText.interactionLoading, {
          thing: intl.formatMessage(storyText.tournaments),
        })}
        title={intl.formatMessage(storyText.tournaments)}
      />
    );
  },
};

export const Loading: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <PageHeader
        loadingLabel={intl.formatMessage(storyText.interactionLoading, {
          thing: intl.formatMessage(storyText.tournaments),
        })}
        title={null}
      />
    );
  },
};
