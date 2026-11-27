import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { Card } from '../ui/atoms/card.js';
import { storyText } from '../ui/story-text.js';
import { WizardTemplate } from './WizardTemplate.js';

const meta = {
  title: 'Admin/Screens/WizardTemplate',
  component: WizardTemplate,
} satisfies Meta<typeof WizardTemplate>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TournamentSetup: Story = {
  args: {
    ariaLabel: '',
    title: '',
    progress: 0,
    progressTestId: '',
    stepsAriaLabel: '',
    steps: [],
    currentStepId: '',
    stepIndicatorVariant: 'plain',
    problems: [],
    onBack: () => {},
    backLabel: '',
    primaryAction: { label: '', disabled: true, onClick: () => {} },
    children: null,
  },
  render: function Render() {
    const intl = useIntl();
    const title = intl.formatMessage(storyText.tournaments);

    return (
      <WizardTemplate
        ariaLabel={title}
        backLabel={intl.formatMessage(storyText.cancel)}
        breadcrumb={intl.formatMessage(storyText.platformTitle)}
        currentStepId="format"
        onBack={() => undefined}
        primaryAction={{
          label: intl.formatMessage(storyText.save),
          disabled: false,
          onClick: () => undefined,
        }}
        problems={[]}
        progress={60}
        progressTestId="wizard-progress"
        stepIndicatorVariant="badge"
        steps={[
          { id: 'name', label: intl.formatMessage(storyText.platformTitle) },
          { id: 'format', label: title },
          { id: 'review', label: intl.formatMessage(storyText.settingsTitle) },
        ]}
        stepsAriaLabel={intl.formatMessage(storyText.tournaments)}
        title={title}
      >
        <Card>{intl.formatMessage(storyText.settingsTitle)}</Card>
      </WizardTemplate>
    );
  },
};
