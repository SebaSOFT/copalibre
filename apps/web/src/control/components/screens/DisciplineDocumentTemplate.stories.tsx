import type { Meta, StoryObj } from '@storybook/react-vite';
import { DisciplineDocumentTemplate } from './DisciplineDocumentTemplate.js';

const meta = {
  title: 'Admin/Screens/DisciplineDocumentTemplate',
  component: DisciplineDocumentTemplate,
  args: {
    alias: 'orbital-frisbee',
    version: '1.0.0',
    data: {
      segmentTypes: [
        {
          name: 'regulation',
          label: 'Regulation period',
          timed: true,
          defaultDurationSeconds: 2700,
        },
      ],
      eventDefinitions: [
        {
          code: 'scoring-play',
          label: 'Scoring play',
          actorRequirement: 'side',
          effects: [{ kind: 'score', awardTo: 'actor', delta: 1 }],
        },
      ],
      defaults: { scoring: { pointsPerWin: 3 } },
      fieldPolicies: {
        'scoring.pointsPerWin': {
          permission: { kind: 'replaced' },
          mutationClass: 'blocked_after_results',
          label: 'Points per win',
        },
      },
    },
  },
} satisfies Meta<typeof DisciplineDocumentTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = {
  args: { data: { segmentTypes: [], eventDefinitions: [], defaults: {}, fieldPolicies: {} } },
};
