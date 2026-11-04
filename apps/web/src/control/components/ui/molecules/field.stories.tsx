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
 * Every state of one field, side by side. A field's height should not depend on
 * which state it is in: compare the boxes, and the control's position inside them.
 */
export const StateHeights: Story = {
  args: { id: '', label: '' },
  render: function Render() {
    const intl = useIntl();
    const label = intl.formatMessage(storyText.settingsTitle);
    const shortHelp = intl.formatMessage(storyText.saved);
    const longHelp = intl.formatMessage(storyText.longHelp);
    const error = intl.formatMessage(storyText.empty);
    const noop = () => undefined;
    const options = [{ value: 'a', label: intl.formatMessage(storyText.tournaments) }];
    return (
      <StoryMatrix
        minColumn="260px"
        cells={[
          {
            label: 'resting',
            children: (
              <Field id="h-resting" label={label}>
                <Input id="h-resting" />
              </Field>
            ),
          },
          {
            label: 'short help',
            children: (
              <Field helpText={shortHelp} id="h-short-help" label={label}>
                <Input id="h-short-help" />
              </Field>
            ),
          },
          {
            label: 'long help',
            children: (
              <Field helpText={longHelp} id="h-long-help" label={label}>
                <Input id="h-long-help" />
              </Field>
            ),
          },
          {
            label: 'error',
            children: (
              <Field errorText={error} id="h-error" label={label}>
                <Input aria-describedby="h-error-error" id="h-error" invalid />
              </Field>
            ),
          },
          {
            label: 'long error',
            children: (
              <Field errorText={longHelp} id="h-long-error" label={label}>
                <Input aria-describedby="h-long-error-error" id="h-long-error" invalid />
              </Field>
            ),
          },
          {
            label: 'required',
            children: (
              <Field id="h-required" label={label} required>
                <Input id="h-required" required />
              </Field>
            ),
          },
          {
            label: 'disabled',
            children: (
              <Field id="h-disabled" label={label}>
                <Input disabled id="h-disabled" />
              </Field>
            ),
          },
          {
            label: 'select',
            children: (
              <Field id="h-select" label={label}>
                <Select onValueChange={noop} options={options} value="a" />
              </Field>
            ),
          },
          {
            label: 'select with help',
            children: (
              <Field helpText={longHelp} id="h-select-help" label={label}>
                <Select onValueChange={noop} options={options} value="a" />
              </Field>
            ),
          },
        ]}
      />
    );
  },
};

/**
 * Three fields in one form row, each in a different state. The controls should
 * stay on one line, and the row should not grow when one field gains a message.
 */
export const RowAlignment: Story = {
  args: { id: '', label: '' },
  render: function Render() {
    const intl = useIntl();
    const label = intl.formatMessage(storyText.settingsTitle);
    const longLabel = intl.formatMessage(storyText.longHelp);
    const error = intl.formatMessage(storyText.empty);
    return (
      <div
        data-testid="field-row"
        style={{
          display: 'grid',
          gap: 'var(--cl-space-4)',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          maxWidth: '720px',
        }}
      >
        <Field id="r-resting" label={label}>
          <Input id="r-resting" />
        </Field>
        <Field id="r-long-label" label={longLabel}>
          <Input id="r-long-label" />
        </Field>
        <Field errorText={error} id="r-error" label={label}>
          <Input aria-describedby="r-error-error" id="r-error" invalid />
        </Field>
      </div>
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
