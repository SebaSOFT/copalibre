import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { Card } from '../ui/atoms/card.js';
import { storyText } from '../ui/story-text.js';
import { WorkspaceTemplate } from './WorkspaceTemplate.js';

const meta = {
  title: 'Admin/Screens/WorkspaceTemplate',
  component: WorkspaceTemplate,
} satisfies Meta<typeof WorkspaceTemplate>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SeedingWorkspace: Story = {
  args: { primaryLabel: '', primaryPane: null, secondaryLabel: '', secondaryPane: null },
  render: function Render() {
    const intl = useIntl();
    const primaryLabel = intl.formatMessage(storyText.tournaments);
    const secondaryLabel = intl.formatMessage(storyText.settingsTitle);

    return (
      <WorkspaceTemplate
        breadcrumbs={[
          { label: intl.formatMessage(storyText.platformTitle), href: '#' },
          { label: primaryLabel, current: true },
        ]}
        description={secondaryLabel}
        primaryLabel={primaryLabel}
        primaryPane={<Card aria-label={primaryLabel}>{primaryLabel}</Card>}
        secondaryLabel={secondaryLabel}
        secondaryPane={<Card aria-label={secondaryLabel}>{secondaryLabel}</Card>}
        title={primaryLabel}
      />
    );
  },
};

export const MediaAndForm: Story = {
  args: { primaryLabel: '', primaryPane: null, secondaryLabel: '', secondaryPane: null },
  render: function Render() {
    const intl = useIntl();
    const primaryLabel = intl.formatMessage(storyText.platformTitle);
    const secondaryLabel = intl.formatMessage(storyText.settingsTitle);

    return (
      <WorkspaceTemplate
        description={secondaryLabel}
        primaryLabel={primaryLabel}
        primaryPane={<Card aria-label={primaryLabel}>{primaryLabel}</Card>}
        secondaryLabel={secondaryLabel}
        secondaryPane={<Card aria-label={secondaryLabel}>{secondaryLabel}</Card>}
        split="media-form"
        title={secondaryLabel}
      />
    );
  },
};
