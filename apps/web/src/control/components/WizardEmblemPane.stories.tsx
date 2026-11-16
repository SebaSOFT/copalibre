import type { Meta, StoryObj } from '@storybook/react-vite';
import { WizardEmblemPane } from './WizardEmblemPane.js';

// A 1x1 transparent PNG: enough for the preview frame to show a picked emblem.
const PICKED_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const meta = {
  title: 'Admin/Screens/WizardEmblemPane',
  component: WizardEmblemPane,
  args: { emblem: undefined, onChange: () => undefined },
} satisfies Meta<typeof WizardEmblemPane>;
export default meta;
type Story = StoryObj<typeof meta>;
/** Nothing picked: the placeholder frame and the drop zone. */
export const Empty: Story = {};
/** A cropped emblem is held for the tournament to receive: the preview and a Remove action. */
export const Picked: Story = {
  args: { emblem: { contentType: 'image/png', contentBase64: PICKED_PNG } },
};
