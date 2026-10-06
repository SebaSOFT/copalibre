import type { Meta, StoryObj } from '@storybook/react-vite';
import { FormattedMessage, useIntl } from 'react-intl';
import { messages } from '../../../i18n/messages.en.js';
import { VisualRuleBuilder } from './VisualRuleBuilder.js';

const meta = {
  title: 'Admin/Organisms/VisualRuleBuilder',
  component: VisualRuleBuilder,
} satisfies Meta<typeof VisualRuleBuilder>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    givenLabel: messages.wizardRuleGiven.id ?? '',
    given: <FormattedMessage {...messages.wizardRuleGivenEvent} />,
    whenLabel: messages.wizardRuleWhen.id ?? '',
    when: <FormattedMessage {...messages.wizardRuleConditionAlways} />,
    thenLabel: messages.wizardRuleThen.id ?? '',
    then: <FormattedMessage {...messages.wizardRuleChooseAction} />,
  },
  render: function Render() {
    const intl = useIntl();
    return (
      <VisualRuleBuilder
        given={<FormattedMessage {...messages.wizardRuleGivenEvent} />}
        givenLabel={intl.formatMessage(messages.wizardRuleGiven)}
        then={<FormattedMessage {...messages.wizardRuleChooseAction} />}
        thenLabel={intl.formatMessage(messages.wizardRuleThen)}
        when={<FormattedMessage {...messages.wizardRuleConditionAlways} />}
        whenLabel={intl.formatMessage(messages.wizardRuleWhen)}
      />
    );
  },
};
