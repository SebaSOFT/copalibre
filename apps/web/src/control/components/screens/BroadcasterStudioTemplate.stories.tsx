import type { Meta, StoryObj } from '@storybook/react-vite';
import { BroadcasterStudioTemplate } from './BroadcasterStudioTemplate.js';

const meta = {
  title: 'Admin/Screens/BroadcasterStudioTemplate',
  component: BroadcasterStudioTemplate,
  args: {
    chroma: 'transparent',
    loading: false,
    mode: 'overlay-lower',
    onChromaChange: () => undefined,
    onCopy: () => undefined,
    onModeChange: () => undefined,
    overlayUrl: 'https://example.test/tv/liga-mendocina/tournaments/apertura-2026?token=abc123',
  },
} satisfies Meta<typeof BroadcasterStudioTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};

export const Loading: Story = { args: { loading: true, overlayUrl: undefined } };

export const LoadFailed: Story = {
  args: { error: 'Could not generate a streaming link.', overlayUrl: undefined },
};

/** The full-screen mode with a green-screen preview background selected. */
export const FullScreenGreenChroma: Story = {
  args: { mode: 'overlay-full', chroma: 'green' },
};
