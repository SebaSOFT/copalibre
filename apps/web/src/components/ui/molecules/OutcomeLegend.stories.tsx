import type { Meta, StoryObj } from '@storybook/react-vite';
import { OutcomeLegend } from './OutcomeLegend.js';

/**
 * The bracket's key, and 0223's reference scenario for it.
 *
 * Consumed by the public bracket stage. Read every story here in greyscale:
 * if advancing and eliminated are still separable, the three channels are
 * doing their job and the fill is decoration rather than information.
 */
const meta = {
  title: 'Public/OutcomeLegend',
  component: OutcomeLegend,
} satisfies Meta<typeof OutcomeLegend>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    label: 'Bracket key',
    entries: [
      { outcome: 'advancing', label: 'Advancing' },
      { outcome: 'eliminated', label: 'Eliminated' },
      { outcome: 'pending', label: 'Not yet decided' },
    ],
  },
};

/** Every outcome side by side, which is how a reviewer checks the glyphs differ. */
export const Matrix: Story = {
  args: {
    label: 'Bracket key',
    entries: [
      { outcome: 'advancing', label: 'Advancing' },
      { outcome: 'eliminated', label: 'Eliminated' },
      { outcome: 'pending', label: 'Not yet decided' },
    ],
  },
};

/** A decided round has nothing pending to explain, so the key does not list it. */
export const DecidedRound: Story = {
  args: {
    label: 'Bracket key',
    entries: [
      { outcome: 'advancing', label: 'Advancing' },
      { outcome: 'eliminated', label: 'Eliminated' },
    ],
  },
};

/** Long translated words wrap; the glyph beside them does not shrink. */
export const LongLabels: Story = {
  args: {
    label: 'Turnierschlüssel',
    entries: [
      { outcome: 'advancing', label: 'Weitergekommen in die nächste Runde' },
      { outcome: 'eliminated', label: 'Aus dem Turnier ausgeschieden' },
    ],
  },
};
