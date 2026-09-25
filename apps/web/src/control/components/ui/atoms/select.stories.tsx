import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { Select, type SelectOption } from './select.js';
import { StoryMatrix } from '../story-matrix.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Atoms/Select',
  component: Select,
  args: { value: 'tournaments', onValueChange: () => undefined, options: [] },
  argTypes: { disabled: { control: 'boolean' }, invalid: { control: 'boolean' } },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Options come from the catalogue too, so their widths move with the language. */
function useOptions(): readonly SelectOption[] {
  const intl = useIntl();
  return [
    { value: 'tournaments', label: intl.formatMessage(storyText.tournaments) },
    { value: 'venues', label: intl.formatMessage(storyText.venuesAndOfficials) },
    { value: 'roles', label: intl.formatMessage(storyText.rolesTitle) },
    { value: 'settings', label: intl.formatMessage(storyText.settingsTitle) },
  ];
}

export const Playground: Story = {
  args: { disabled: false, invalid: false, value: 'tournaments' },
  render: function Render(args) {
    const options = useOptions();
    const [value, setValue] = useState(args.value);
    const intl = useIntl();
    return (
      <Select
        {...args}
        aria-label={intl.formatMessage(storyText.settingsTitle)}
        onValueChange={setValue}
        options={options}
        value={value}
      />
    );
  },
};

/** A select whose options carry a compact code badge (e.g. a language switcher). */
export const WithBadges: Story = {
  args: { value: 'en' },
  render: function Render() {
    const [value, setValue] = useState('en');
    return (
      <Select
        aria-label="Language"
        onValueChange={setValue}
        options={[
          { value: 'en', label: 'English', badge: 'EN' },
          { value: 'es', label: 'Español', badge: 'ES' },
          { value: 'fr', label: 'Français', badge: 'FR' },
        ]}
        value={value}
      />
    );
  },
};

export const Matrix: Story = {
  args: { value: 'tournaments' },
  render: function Render() {
    const options = useOptions();
    const noop = () => undefined;
    return (
      <StoryMatrix
        minColumn="200px"
        cells={[
          {
            label: 'default',
            children: (
              <Select
                aria-label="default"
                onValueChange={noop}
                options={options}
                value="tournaments"
              />
            ),
          },
          {
            label: 'invalid',
            children: (
              <Select
                aria-label="invalid"
                invalid
                onValueChange={noop}
                options={options}
                value="tournaments"
              />
            ),
          },
          {
            label: 'disabled',
            children: (
              <Select
                aria-label="disabled"
                disabled
                onValueChange={noop}
                options={options}
                value="tournaments"
              />
            ),
          },
          {
            label: 'long option selected',
            children: (
              <Select aria-label="long" onValueChange={noop} options={options} value="venues" />
            ),
          },
        ]}
      />
    );
  },
};
