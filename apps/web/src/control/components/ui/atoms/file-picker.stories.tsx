import type { Meta, StoryObj } from '@storybook/react-vite';
import { FilePicker } from './file-picker.js';
import { StoryMatrix } from '../story-matrix.js';

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

export const Playground: Story = {
  render: function Render() {
    return (
      <div style={{ maxWidth: '400px' }}>
        <FilePicker
          id="playground-file-picker"
          label="Team crest or logo"
          accept=".png,.jpg,.svg"
          maxSizeBytes={2 * 1024 * 1024}
          hint="PNG, JPG or SVG up to 2MB"
        />
      </div>
    );
  },
};

export const Matrix: Story = {
  render: function Render() {
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
              />
            ),
          },
          {
            label: 'disabled',
            children: <FilePicker id="matrix-disabled" label="Logo" accept=".png" disabled />,
          },
        ]}
      />
    );
  },
};
