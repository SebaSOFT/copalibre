import type { Meta, StoryObj } from '@storybook/react-vite';
import { DeviceHeartbeat } from './DeviceHeartbeat.js';
import { TOURNAMENT, NOW, ids } from './screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/DeviceHeartbeat',
  component: DeviceHeartbeat,
  args: {
    now: Date.parse(NOW),
    devices: ['online', 'stale', 'never-seen', 'revoked'].map((state, index) => ({
      tournamentAlias: TOURNAMENT,
      token: {
        displayTokenId: `${ids.match.slice(0, -1)}${index}`,
        tournamentId: ids.tournament,
        label: `Cancha ${index + 1}`,
        revoked: state === 'revoked',
        createdAt: NOW,
        ...(state === 'never-seen'
          ? {}
          : { lastSeenAt: state === 'stale' ? '2026-09-08T18:00:00.000Z' : NOW }),
      },
    })),
  },
} satisfies Meta<typeof DeviceHeartbeat>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { devices: [] } };
