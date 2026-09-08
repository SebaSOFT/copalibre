import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { AuthScreenTemplate } from './auth-screen-template.js';
import { FormField } from '../molecules/form-field.js';
import { Input } from '../atoms/input.js';
import { Button } from '../atoms/button.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Templates/AuthScreenTemplate',
  component: AuthScreenTemplate,
  args: { tagline: '', children: null },
  argTypes: { tagline: { control: 'text' } },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AuthScreenTemplate>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The template exists so every unauthenticated screen keeps its page gutter at
 * every width — the invitation screen used to centre its own card in a bare
 * body and ran flush to both edges on mobile. Check it at 374px and 188px.
 */
export const SignIn: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <AuthScreenTemplate tagline={intl.formatMessage(storyText.platformTitle)}>
        <form style={{ display: 'grid', gap: 'var(--cl-space-4)' }}>
          <FormField id="auth-email" label={intl.formatMessage(storyText.settingsTitle)}>
            <Input id="auth-email" type="email" />
          </FormField>
          <FormField id="auth-password" label={intl.formatMessage(storyText.rolesTitle)}>
            <Input id="auth-password" type="password" />
          </FormField>
          <Button type="submit" variant="primary">
            {intl.formatMessage(storyText.save)}
          </Button>
        </form>
      </AuthScreenTemplate>
    );
  },
};

/** An error on the panel, which is what a rejected sign-in actually shows. */
export const WithError: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <AuthScreenTemplate tagline={intl.formatMessage(storyText.platformTitle)}>
        <form style={{ display: 'grid', gap: 'var(--cl-space-4)' }}>
          <FormField
            errorText={intl.formatMessage(storyText.empty)}
            id="auth-email-error"
            label={intl.formatMessage(storyText.settingsTitle)}
          >
            <Input aria-describedby="auth-email-error-error" id="auth-email-error" invalid />
          </FormField>
          <Button type="submit" variant="primary">
            {intl.formatMessage(storyText.save)}
          </Button>
        </form>
      </AuthScreenTemplate>
    );
  },
};
