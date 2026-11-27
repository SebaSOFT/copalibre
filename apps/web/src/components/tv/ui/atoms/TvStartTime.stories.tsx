import type { Meta, StoryObj } from '@storybook/react-vite';
import { TvStartTime } from './TvStartTime.js';

const meta = {
  title: 'TV/Kiosk & Full-Frame Widget/TvStartTime',
  component: TvStartTime,
  args: {
    scheduledAt: '2099-11-25T16:00:00Z',
    court: 'Aldo Cantoni',
    locale: 'es',
    timeZone: 'America/Argentina/Mendoza',
    referenceDate: Date.parse('2099-11-24T12:00:00Z'),
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TvStartTime>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithCourt: Story = {};
export const WithoutCourt: Story = { args: { court: undefined } };
