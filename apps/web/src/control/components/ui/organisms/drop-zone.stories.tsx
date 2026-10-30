import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { DropZone } from './drop-zone.js';
import { filePickerLabels } from '../../../lib/file-picker-labels.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Organisms/DropZone',
  component: DropZone,
} satisfies Meta<typeof DropZone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    id: '',
    label: '',
    clearLabel: '',
    promptText: '',
    promptDraggingText: '',
    clearButtonText: '',
    formatFilesSelected: () => '',
  },
  render: function Render() {
    const intl = useIntl();
    const accept = 'image/*';
    return (
      <DropZone
        accept={accept}
        id="organization-emblem"
        instruction={intl.formatMessage(storyText.uploadEmblem)}
        label={intl.formatMessage(storyText.uploadEmblem)}
        onChange={() => {}}
        {...filePickerLabels(intl, { accept })}
      />
    );
  },
};
