import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { SectionTabs } from './section-tabs.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Organisms/SectionTabs',
  component: SectionTabs,
} satisfies Meta<typeof SectionTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { ariaLabel: '', tabs: [], currentTabId: '' },
  render: function Render() {
    const intl = useIntl();
    return (
      <SectionTabs
        ariaLabel={intl.formatMessage(storyText.settingsTitle)}
        currentTabId="tournaments"
        tabs={[
          {
            id: 'tournaments',
            label: intl.formatMessage(storyText.tournaments),
            href: '#tournaments',
          },
          {
            id: 'venues',
            label: intl.formatMessage(storyText.venuesAndOfficials),
            href: '#venues',
          },
          { id: 'roles', label: intl.formatMessage(storyText.rolesTitle), href: '#roles' },
        ]}
      />
    );
  },
};
