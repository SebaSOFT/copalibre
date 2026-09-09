import type { Meta, StoryObj } from '@storybook/react-vite';
import { ImageCropModal } from './ImageCropModal.js';
const meta = {
  title: 'Admin/Screens/ImageCropModal',
  component: ImageCropModal,
  args: {
    imageSrc:
      'data:image/svg+xml,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="410" height="512"><rect width="410" height="512" fill="navy"/><circle cx="205" cy="256" r="100" fill="white"/></svg>',
      ),
    onCancel: () => undefined,
    onConfirm: () => undefined,
  },
} satisfies Meta<typeof ImageCropModal>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
