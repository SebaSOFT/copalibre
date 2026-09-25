import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  publicIntl,
  tvDashboardLabels,
  tvStatisticsLabels,
} from '../../../../lib/i18n/public-intl.js';
import { TvEventTicker } from './TvEventTicker.js';

const meta = {
  title: 'TV/Kiosk & Full-Frame Widget/TvEventTicker',
  component: TvEventTicker,
  args: {
    ariaLabel: tvDashboardLabels(publicIntl('es')).matchEventsLabel,
    homeLabel: tvStatisticsLabels(publicIntl('es')).homeSide,
    awayLabel: tvStatisticsLabels(publicIntl('es')).awaySide,
    language: 'es',
    events: [
      {
        eventId: 'event-1',
        label: 'Gol',
        occurredAt: '2026-09-24T18:12:00.000Z',
        side: 'home',
        actor: '#9 Priya Natarajan-Whitfield',
      },
      {
        eventId: 'event-2',
        label: 'Tarjeta amarilla',
        occurredAt: '2026-09-24T18:34:00.000Z',
        side: 'away',
        actor: '#5 Mateus Albuquerque',
      },
      {
        eventId: 'event-3',
        label: 'Gol',
        occurredAt: '2026-09-24T18:41:00.000Z',
        side: 'home',
        actor: '#7 Jordan Ashworth',
      },
    ],
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TvEventTicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const NoEvents: Story = { args: { events: [] } };
