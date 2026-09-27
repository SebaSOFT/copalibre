import type { Meta, StoryObj } from '@storybook/react-vite';
import { BroadcastAlertBanner, type BroadcastAlertItem } from './BroadcastAlertBanner.js';

const SCORING: BroadcastAlertItem = {
  event: {
    eventId: 'ev-1',
    definitionCode: 'goal',
    label: 'Goal',
    occurredAt: '2026-08-19T12:00:00.000Z',
    side: 'home',
    actor: '#9 Ada Osei',
  },
  kind: 'scoring',
};

const NOTABLE: BroadcastAlertItem = {
  event: {
    eventId: 'ev-2',
    definitionCode: 'yellow-card',
    label: 'Yellow card',
    occurredAt: '2026-08-19T12:34:00.000Z',
    side: 'away',
    actor: '#5 Marcus Feld',
  },
  kind: 'notable',
};

const meta = {
  title: 'TV/Kiosk & Full-Frame Widget/BroadcastAlertBanner',
  component: BroadcastAlertBanner,
  args: {
    awayLabel: 'Away',
    homeLabel: 'Home',
    onConsumed: () => undefined,
    queue: [SCORING],
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof BroadcastAlertBanner>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A scoring event — the wider, longer-dwelling callout. */
export const Scoring: Story = {};

/** A non-scoring event — a shorter dwell, no score line. */
export const Notable: Story = { args: { queue: [NOTABLE] } };

/** No event queued: the overlay shows nothing at all. */
export const Empty: Story = { args: { queue: [] } };

/** `prefers-reduced-motion` fallback: a plain crossfade, no slide/scale. */
export const ReducedMotion: Story = { args: { prefersReducedMotion: true } };
