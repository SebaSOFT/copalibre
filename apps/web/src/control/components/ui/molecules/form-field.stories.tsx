import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { FormField } from './form-field.js';
import { Input } from '../atoms/input.js';
import { Select } from '../atoms/select.js';
import { Textarea } from '../atoms/textarea.js';
import { StoryMatrix } from '../story-matrix.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Molecules/FormField',
  component: FormField,
  args: { id: 'story-field', label: '', children: null },
  argTypes: {
    id: { control: 'text' },
    label: { control: 'text' },
    helpText: { control: 'text' },
    errorText: { control: 'text' },
  },
} satisfies Meta<typeof FormField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { id: 'story-field', label: 'Tournament name' },
  render: function Render(args) {
    return (
      <div style={{ maxWidth: '360px' }}>
        <FormField {...args}>
          <Input
            aria-describedby={args.errorText ? `${args.id}-error` : undefined}
            aria-invalid={args.errorText ? true : undefined}
            id={args.id}
            invalid={Boolean(args.errorText)}
          />
        </FormField>
      </div>
    );
  },
};

/**
 * The molecule shows help text or error text, never both — an error replaces
 * the help. That precedence is invisible until the two are seen together.
 */
export const Matrix: Story = {
  args: { id: '', label: '' },
  render: function Render() {
    const intl = useIntl();
    const label = intl.formatMessage(storyText.settingsTitle);
    const help = intl.formatMessage(storyText.saved);
    const error = intl.formatMessage(storyText.empty);
    return (
      <StoryMatrix
        minColumn="260px"
        cells={[
          {
            label: 'bare',
            children: (
              <FormField id="f-bare" label={label}>
                <Input id="f-bare" />
              </FormField>
            ),
          },
          {
            label: 'with help',
            children: (
              <FormField helpText={help} id="f-help" label={label}>
                <Input id="f-help" />
              </FormField>
            ),
          },
          {
            label: 'with error',
            children: (
              <FormField errorText={error} id="f-error" label={label}>
                <Input aria-describedby="f-error-error" id="f-error" invalid />
              </FormField>
            ),
          },
          {
            label: 'error wins over help',
            children: (
              <FormField errorText={error} helpText={help} id="f-both" label={label}>
                <Input aria-describedby="f-both-error" id="f-both" invalid />
              </FormField>
            ),
          },
        ]}
      />
    );
  },
};

/** The molecule takes any control atom in its slot, not only an input. */
export const EveryControlAtom: Story = {
  args: { id: '', label: '' },
  render: function Render() {
    const intl = useIntl();
    const label = intl.formatMessage(storyText.settingsTitle);
    const noop = () => undefined;
    return (
      <StoryMatrix
        minColumn="260px"
        cells={[
          {
            label: 'Input',
            children: (
              <FormField id="f-input" label={label}>
                <Input id="f-input" />
              </FormField>
            ),
          },
          {
            label: 'Select',
            children: (
              <FormField id="f-select" label={label}>
                <Select
                  onValueChange={noop}
                  options={[{ value: 'a', label: intl.formatMessage(storyText.tournaments) }]}
                  value="a"
                />
              </FormField>
            ),
          },
          {
            label: 'Textarea',
            children: (
              <FormField id="f-textarea" label={label}>
                <Textarea id="f-textarea" rows={3} />
              </FormField>
            ),
          },
        ]}
      />
    );
  },
};
