import type { Meta, StoryObj } from '@storybook/react-vite';
import { TvChampions } from './TvChampions.js';

const meta = {
  title: 'TV/Kiosk & Full-Frame Widget/TvChampions',
  component: TvChampions,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TvChampions>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ThreeCups: Story = {
  args: {
    zones: [
      { zoneName: 'Copa Oro', champions: [{ name: 'Andes Talleres', abbreviation: 'AND' }] },
      {
        zoneName: 'Copa Plata',
        champions: [{ name: 'Concepcion Patin Club', abbreviation: 'CON' }],
      },
      {
        zoneName: 'Copa Bronce',
        champions: [
          { name: 'Atletico Union', abbreviation: 'CAU' },
          { name: 'Estudiantil San Miguel', abbreviation: 'ESTSM' },
        ],
      },
    ],
  },
};
