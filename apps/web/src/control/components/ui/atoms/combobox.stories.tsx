import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { Combobox } from './combobox.js';
import { messages } from '../../../i18n/messages.en.js';

const meta = {
  title: 'Admin/Atoms/Combobox',
  component: Combobox,
  args: { id: 'combobox-story', value: '', onValueChange: () => undefined, options: [] },
} satisfies Meta<typeof Combobox>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Grouped suggestions that narrow as one types; free text stays when nothing fits. */
export const Grouped: Story = {
  render: function Render() {
    const intl = useIntl();
    const [value, setValue] = useState('');
    const presets = intl.formatMessage(messages.reasonPromptPresetsGroup);
    const recent = intl.formatMessage(messages.reasonPromptRecentGroup);
    return (
      <Combobox
        aria-label={intl.formatMessage(messages.reasonPromptBatchLabel)}
        id="combobox-grouped"
        onValueChange={setValue}
        options={[
          {
            value: 'weather',
            label: intl.formatMessage(messages.scheduleReasonWeather),
            group: presets,
          },
          {
            value: 'venue-unavailable',
            label: intl.formatMessage(messages.scheduleReasonVenueUnavailable),
            group: presets,
          },
          { value: 'recent-1', label: 'Cancha 1 sin luz', group: recent },
        ]}
        placeholder={intl.formatMessage(messages.reasonPromptPlaceholder)}
        value={value}
      />
    );
  },
};

/** The error state the field carries when a required reason is missing. */
export const Invalid: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <Combobox
        aria-label={intl.formatMessage(messages.reasonPromptBatchLabel)}
        id="combobox-invalid"
        invalid
        onValueChange={() => undefined}
        options={[]}
        value=""
      />
    );
  },
};
