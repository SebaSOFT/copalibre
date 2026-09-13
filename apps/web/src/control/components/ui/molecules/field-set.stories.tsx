import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { FieldSet } from './field-set.js';
import { Field } from './field.js';
import { Input } from '../atoms/input.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Molecules/FieldSet',
  component: FieldSet,
  args: { legend: '', children: null },
} satisfies Meta<typeof FieldSet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: function Render() {
    const intl = useIntl();
    const label = intl.formatMessage(storyText.settingsTitle);
    return (
      <FieldSet legend={label}>
        <Field id="fieldset-story-a" label={label}>
          <Input id="fieldset-story-a" />
        </Field>
        <Field id="fieldset-story-b" label={label}>
          <Input id="fieldset-story-b" />
        </Field>
      </FieldSet>
    );
  },
};

/**
 * The narrowest declared width. Select the "Zoom floor — 188px" viewport to
 * confirm the legend and border stay inside the fieldset's own bounds.
 */
export const NarrowFloor: Story = {
  render: function Render() {
    const intl = useIntl();
    const label = intl.formatMessage(storyText.settingsTitle);
    return (
      <FieldSet legend={label}>
        <Field id="fieldset-narrow" label={label}>
          <Input id="fieldset-narrow" />
        </Field>
      </FieldSet>
    );
  },
};
