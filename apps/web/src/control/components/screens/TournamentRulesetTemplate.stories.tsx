import type { Meta, StoryObj } from '@storybook/react-vite';
import { TournamentRulesetTemplate } from '../screens/TournamentRulesetTemplate.js';
import { ORG, TOURNAMENT } from '../screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/TournamentRulesetTemplate',
  component: TournamentRulesetTemplate,
  args: {
    organizationAlias: ORG,
    tournamentAlias: TOURNAMENT,
    overrides: {
      format: 'round-robin',
      'scoring.pointsPerWin': 3,
      'venuePolicy.neutralGround': true,
      tiebreakers: ['goals-against'],
      segments: { overtimeEnabled: true },
    },
    fieldPolicies: {
      format: { permission: { kind: 'replaced' }, mutationClass: 'blocked_after_results' },
      'scoring.pointsPerWin': {
        permission: { kind: 'replaced' },
        mutationClass: 'blocked_after_results',
        label: 'Points per win',
      },
      'scoring.pointsPerDraw': {
        permission: { kind: 'replaced' },
        mutationClass: 'blocked_after_results',
      },
      'venuePolicy.neutralGround': {
        permission: { kind: 'replaced' },
        mutationClass: 'safe',
        label: 'Neutral ground required',
      },
      tiebreakers: {
        permission: { kind: 'merged', strategy: 'union-list' },
        mutationClass: 'requires_rebuild',
        label: 'Tiebreakers',
      },
      segments: {
        permission: { kind: 'merged', strategy: 'shallow-object' },
        mutationClass: 'requires_rebuild',
        label: 'Segments',
      },
    },
    disciplineDefaults: {
      scoring: { pointsPerWin: 2, pointsPerDraw: 1 },
      venuePolicy: { neutralGround: false },
      tiebreakers: ['points', 'score-difference', 'goals-for'],
      segments: { regulationCount: 2, overtimeEnabled: false },
    },
    availableFormats: ['single-elimination', 'round-robin', 'league'],
    onPreview: async () => [],
    onSave: async () => undefined,
  },
} satisfies Meta<typeof TournamentRulesetTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One field of every `ControlKind`: format-select, number, checkbox, add-to-list, patch-object. */
export const Loaded: Story = {};
export const Empty: Story = { args: { overrides: {} } };
export const NoDisciplineContext: Story = {
  args: { fieldPolicies: undefined, disciplineDefaults: undefined },
};
export const UndeclaredField: Story = {
  name: 'Undeclared field (raw JSON fallback)',
  args: { overrides: { ...meta.args.overrides, legacyField: { anything: 'goes' } } },
};
