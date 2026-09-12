import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { Field } from './field.js';
import { Input } from '../atoms/input.js';
import { Select } from '../atoms/select.js';
import { Textarea } from '../atoms/textarea.js';
import { StoryMatrix } from '../story-matrix.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Molecules/Field',
  component: Field,
  args: { id: 'story-field', label: '', children: null },
  argTypes: {
    id: { control: 'text' },
    label: { control: 'text' },
    helpText: { control: 'text' },
    errorText: { control: 'text' },
  },
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { id: 'story-field', label: 'Tournament name' },
  render: function Render(args) {
    return (
      <div style={{ maxWidth: '360px' }}>
        <Field {...args}>
          <Input
            aria-describedby={args.errorText ? `${args.id}-error` : undefined}
            aria-invalid={args.errorText ? true : undefined}
            id={args.id}
            invalid={Boolean(args.errorText)}
          />
        </Field>
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
              <Field id="f-bare" label={label}>
                <Input id="f-bare" />
              </Field>
            ),
          },
          {
            label: 'with help',
            children: (
              <Field helpText={help} id="f-help" label={label}>
                <Input id="f-help" />
              </Field>
            ),
          },
          {
            label: 'with error',
            children: (
              <Field errorText={error} id="f-error" label={label}>
                <Input aria-describedby="f-error-error" id="f-error" invalid />
              </Field>
            ),
          },
          {
            label: 'error wins over help',
            children: (
              <Field errorText={error} helpText={help} id="f-both" label={label}>
                <Input aria-describedby="f-both-error" id="f-both" invalid />
              </Field>
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
              <Field id="f-input" label={label}>
                <Input id="f-input" />
              </Field>
            ),
          },
          {
            label: 'Select',
            children: (
              <Field id="f-select" label={label}>
                <Select
                  onValueChange={noop}
                  options={[{ value: 'a', label: intl.formatMessage(storyText.tournaments) }]}
                  value="a"
                />
              </Field>
            ),
          },
          {
            label: 'Textarea',
            children: (
              <Field id="f-textarea" label={label}>
                <Textarea id="f-textarea" rows={3} />
              </Field>
            ),
          },
        ]}
      />
    );
  },
};

/** The required indicator is purely visual; the caller's own control still carries the real `required` attribute. */
export const Required: Story = {
  args: { id: '', label: '' },
  render: function Render() {
    const intl = useIntl();
    const label = intl.formatMessage(storyText.settingsTitle);
    return (
      <StoryMatrix
        minColumn="260px"
        cells={[
          {
            label: 'optional',
            children: (
              <Field id="f-optional" label={label}>
                <Input id="f-optional" />
              </Field>
            ),
          },
          {
            label: 'required',
            children: (
              <Field id="f-required" label={label} required>
                <Input id="f-required" required />
              </Field>
            ),
          },
        ]}
      />
    );
  },
};

/**
 * A long label and a long error at the narrowest declared width. Select the
 * "Zoom floor — 188px" viewport and switch languages to confirm neither
 * wraps into the control below it or the field beside it.
 */
export const NarrowFloor: Story = {
  args: { id: '', label: '' },
  render: function Render() {
    const intl = useIntl();
    return (
      <Field
        errorText={intl.formatMessage(storyText.empty)}
        id="f-narrow"
        label={intl.formatMessage(storyText.settingsTitle)}
        required
      >
        <Input aria-describedby="f-narrow-error" id="f-narrow" invalid />
      </Field>
    );
  },
};
