import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { Form } from './form.js';
import { Input } from './input.js';
import { Button } from './button.js';
import { Field } from '../molecules/field.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Atoms/Form',
  component: Form,
  args: { children: null },
} satisfies Meta<typeof Form>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <Form onSubmit={(event) => event.preventDefault()}>
        <Field id="form-story-name" label={intl.formatMessage(storyText.settingsTitle)}>
          <Input id="form-story-name" />
        </Field>
        <Button type="submit">{intl.formatMessage(storyText.saved)}</Button>
      </Form>
    );
  },
};
