import type { Meta, StoryObj } from '@storybook/react-vite';
import { StageHubTemplate } from './StageHubTemplate.js';
import { ORG, TOURNAMENT } from '../screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/StageHubTemplate',
  component: StageHubTemplate,
  args: {
    organizationAlias: ORG,
    tournamentAlias: TOURNAMENT,
    stageNumber: 1,
    stageName: 'Fase de grupos',
    stageFormat: 'round-robin',
    availableFormats: ['round-robin', 'single-elimination', 'double-elimination'],
    formatDescriptions: {
      'round-robin': 'Every entrant plays every other entrant once',
      'single-elimination': { en: 'Single elimination bracket', es: 'Eliminación directa' },
    },
    seeded: false,
    onRename: async () => undefined,
    onChangeFormat: async () => undefined,
    onDelete: async () => undefined,
  },
} satisfies Meta<typeof StageHubTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Unseeded: Story = {};
export const Seeded: Story = { args: { seeded: true } };
