import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { AuthScreenLayout } from './auth-screen-layout.js';
import { Field } from '../molecules/field.js';
import { Input } from '../atoms/input.js';
import { Button } from '../atoms/button.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Layouts/AuthScreenLayout',
  component: AuthScreenLayout,
  args: { tagline: '', children: null },
  argTypes: { tagline: { control: 'text' } },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AuthScreenLayout>;

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
      <AuthScreenLayout tagline={intl.formatMessage(storyText.platformTitle)}>
        <form style={{ display: 'grid', gap: 'var(--cl-space-4)' }}>
          <Field id="auth-email" label={intl.formatMessage(storyText.settingsTitle)}>
            <Input id="auth-email" type="email" />
          </Field>
          <Field id="auth-password" label={intl.formatMessage(storyText.rolesTitle)}>
            <Input id="auth-password" type="password" />
          </Field>
          <Button type="submit" variant="primary">
            {intl.formatMessage(storyText.save)}
          </Button>
        </form>
      </AuthScreenLayout>
    );
  },
};

/** An error on the panel, which is what a rejected sign-in actually shows. */
export const WithError: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <AuthScreenLayout tagline={intl.formatMessage(storyText.platformTitle)}>
        <form style={{ display: 'grid', gap: 'var(--cl-space-4)' }}>
          <Field
            errorText={intl.formatMessage(storyText.empty)}
            id="auth-email-error"
            label={intl.formatMessage(storyText.settingsTitle)}
          >
            <Input aria-describedby="auth-email-error-error" id="auth-email-error" invalid />
          </Field>
          <Button type="submit" variant="primary">
            {intl.formatMessage(storyText.save)}
          </Button>
        </form>
      </AuthScreenLayout>
    );
  },
};
