import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { FilePicker } from './file-picker.js';
import { StoryMatrix } from '../story-matrix.js';
import { filePickerLabels } from '../../../lib/file-picker-labels.js';

const meta = {
  title: 'Admin/Atoms/FilePicker',
  component: FilePicker,
  args: {
    id: 'story-file-picker',
    label: 'Upload file',
  },
} satisfies Meta<typeof FilePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Prompt, constraints, clear button, and file-count text all come from
 * `filePickerLabels(intl)` (openspec 0285), not literals — the toolbar's
 * language selector shows a real translation for every one of them, the
 * same way `Button`'s story does for its label.
 */
export const Playground: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <div style={{ maxWidth: '400px' }}>
        <FilePicker
          id="playground-file-picker"
          label="Team crest or logo"
          accept=".png,.jpg,.svg"
          maxSizeBytes={2 * 1024 * 1024}
          hint="PNG, JPG or SVG up to 2MB"
          {...filePickerLabels(intl, { accept: '.png,.jpg,.svg', maxSizeBytes: 2 * 1024 * 1024 })}
        />
      </div>
    );
  },
};

export const Matrix: Story = {
  render: function Render() {
    const intl = useIntl();
    const labels = filePickerLabels(intl, { accept: '.png', maxSizeBytes: 1024 * 1024 });
    return (
      <StoryMatrix
        minColumn="260px"
        cells={[
          {
            label: 'default',
            children: (
              <FilePicker
                id="matrix-default"
                label="Logo"
                accept=".png"
                maxSizeBytes={1024 * 1024}
                {...labels}
              />
            ),
          },
          {
            label: 'error',
            children: (
              <FilePicker
                id="matrix-error"
                label="Logo"
                accept=".png"
                maxSizeBytes={1024 * 1024}
                error="File exceeds maximum size limit of 1 MB"
                {...labels}
              />
            ),
          },
          {
            label: 'disabled',
            children: (
              <FilePicker
                id="matrix-disabled"
                label="Logo"
                accept=".png"
                disabled
                {...filePickerLabels(intl, { accept: '.png' })}
              />
            ),
          },
        ]}
      />
    );
  },
};
