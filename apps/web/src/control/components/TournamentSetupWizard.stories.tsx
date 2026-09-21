import type { Meta, StoryObj } from '@storybook/react-vite';
import { TournamentSetupWizard } from './TournamentSetupWizard.js';
import { discipline } from './screen-story-fixtures.js';
import type { DisciplineOption } from '../lib/wizard.js';

const disciplineWithDoubleElimination: DisciplineOption = {
  ...discipline,
  supportedFormats: ['single-elimination', 'double-elimination', 'round-robin'],
};

const disciplineWithRulesetFields: DisciplineOption = {
  ...discipline,
  defaults: { scoring: { pointsPerWin: 3 }, tiebreakers: ['points', 'goals-for'] },
  fieldPolicies: {
    format: { permission: { kind: 'replaced' }, mutationClass: 'blocked_after_results' },
    'registration.capacity': {
      permission: { kind: 'replaced' },
      mutationClass: 'requires_rebuild',
    },
    'scoring.pointsPerWin': {
      permission: { kind: 'replaced' },
      mutationClass: 'blocked_after_results',
    },
    tiebreakers: {
      permission: { kind: 'merged', strategy: 'union-list' },
      mutationClass: 'requires_rebuild',
    },
  },
};

const meta = {
  title: 'Admin/Screens/TournamentSetupWizard',
  component: TournamentSetupWizard,
  args: { disciplines: [disciplineWithDoubleElimination] },
} satisfies Meta<typeof TournamentSetupWizard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};
export const Empty: Story = { args: { disciplines: [] } };

export const FormatStepSingleElimination: Story = {
  args: {
    initialState: {
      step: 'format',
      stages: [{ number: 1, name: 'Elimination Stage', format: 'single-elimination' }],
    },
  },
};

export const FormatStepDoubleElimination: Story = {
  args: {
    initialState: {
      step: 'format',
      stages: [{ number: 1, name: 'Double Bracket', format: 'double-elimination' }],
    },
  },
};

export const FormatStepRoundRobin: Story = {
  args: {
    initialState: {
      step: 'format',
      stages: [{ number: 1, name: 'Group Stage', format: 'round-robin' }],
    },
  },
};

export const FormatStepIllustrativeCount: Story = {
  args: {
    initialState: {
      step: 'format',
      capacity: undefined,
      stages: [{ number: 1, name: 'Playoffs', format: 'single-elimination' }],
    },
  },
};

export const FormatStepCapacityDeclared: Story = {
  args: {
    initialState: {
      step: 'format',
      capacity: 16,
      stages: [{ number: 1, name: 'Main Championship', format: 'single-elimination' }],
    },
  },
};

export const FormatStepLaterStageNoPreview: Story = {
  args: {
    initialState: {
      step: 'format',
      stages: [
        { number: 1, name: 'Qualifiers', format: 'round-robin' },
        { number: 2, name: 'Finals', format: 'single-elimination' },
      ],
    },
  },
};

export const RulesetStepWithFields: Story = {
  args: {
    disciplines: [disciplineWithRulesetFields],
    initialState: {
      step: 'ruleset',
      descriptorId: disciplineWithRulesetFields.descriptorId,
      descriptorVersion: disciplineWithRulesetFields.version,
    },
  },
};

export const RulesetStepEmpty: Story = {
  args: {
    initialState: {
      step: 'ruleset',
      descriptorId: discipline.descriptorId,
      descriptorVersion: discipline.version,
    },
  },
};
