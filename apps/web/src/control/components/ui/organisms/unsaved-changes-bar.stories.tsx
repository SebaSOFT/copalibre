import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { UnsavedChangesBar } from './unsaved-changes-bar.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Organisms/UnsavedChangesBar',
  component: UnsavedChangesBar,
} satisfies Meta<typeof UnsavedChangesBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    dirty: false,
    summary: '',
    fieldsLabel: '',
    changedFields: [],
    resetLabel: '',
    saveLabel: '',
    onReset: () => {},
    onSave: () => {},
  },
  render: function Render() {
    const intl = useIntl();
    const [dirty, setDirty] = useState(true);

    return (
      <UnsavedChangesBar
        changedFields={[
          { id: 'club-name', label: intl.formatMessage(storyText.clubName) },
          { id: 'capacity', label: intl.formatMessage(storyText.capacity) },
        ]}
        dirty={dirty}
        fieldsLabel={intl.formatMessage(storyText.settingsTitle)}
        onReset={() => setDirty(false)}
        onSave={() => setDirty(false)}
        resetLabel={intl.formatMessage(storyText.cancel)}
        saveLabel={intl.formatMessage(storyText.save)}
        summary={intl.formatMessage(storyText.saveChanges)}
      />
    );
  },
};
