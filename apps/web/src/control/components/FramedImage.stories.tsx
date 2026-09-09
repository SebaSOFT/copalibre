import type { Meta, StoryObj } from '@storybook/react-vite';
import { FramedImage } from './FramedImage.js';
import { names, ids } from './screen-story-fixtures.js';
const meta = {
  title: 'Admin/Screens/FramedImage',
  component: FramedImage,
  args: {
    src:
      'data:image/svg+xml,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="410" height="512"><rect width="410" height="512" fill="navy"/><circle cx="205" cy="256" r="100" fill="white"/></svg>',
      ),
    alt: names[ids.first],
    placeholder: 'MS',
    size: 96,
  },
} satisfies Meta<typeof FramedImage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { src: undefined } };
export const Failed: Story = { args: { src: 'data:image/png;base64,invalid' } };
