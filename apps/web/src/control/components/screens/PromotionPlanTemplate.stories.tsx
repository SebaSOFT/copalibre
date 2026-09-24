import type { Meta, StoryObj } from '@storybook/react-vite';
import { PromotionPlanTemplate } from '../screens/PromotionPlanTemplate.js';
import { TOURNAMENT, ids } from '../screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/PromotionPlanTemplate',
  component: PromotionPlanTemplate,
  args: {
    entrantLabel: (entrantId) => (entrantId === ids.first ? 'Club Atlético' : 'Deportivo Cuyo'),
    onSave: async () => undefined,
    preview: {
      combined: [
        { entrantId: ids.first, groupId: ids.match, rank: 1 },
        { entrantId: ids.second, groupId: ids.stage, rank: 1 },
      ],
      trace: [],
    },
    previewError: undefined,
    tournamentAlias: TOURNAMENT,
    zone: {
      zoneId: ids.third,
      stageId: ids.stage,
      number: 1,
      name: 'Copa Premier',
    },
    zoneNumber: 1,
  },
} satisfies Meta<typeof PromotionPlanTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const NoPlanYet: Story = {
  args: {
    preview: undefined,
    previewError: { message: 'No promotion plan configured yet.', tone: 'info' },
  },
};
