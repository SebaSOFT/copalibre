import type { Meta, StoryObj } from '@storybook/react-vite';
import { WizardShell } from './wizard-shell.js';

const STEPS = [
  { id: 'name', label: 'Name' },
  { id: 'discipline', label: 'Discipline' },
  { id: 'format', label: 'Format' },
  { id: 'rules', label: 'Rules' },
  { id: 'window', label: 'Window' },
];

const meta = {
  title: 'Admin/Organisms/WizardShell',
  component: WizardShell,
  args: {
    ariaLabel: 'Tournament setup',
    title: 'Set up a tournament',
    progress: 60,
    progressTestId: 'wizard-progress',
    stepsAriaLabel: 'Steps',
    steps: STEPS,
    currentStepId: 'rules',
    stepIndicatorVariant: 'badge',
    problems: [],
    onBack: () => undefined,
    backLabel: 'Back',
    primaryAction: { label: 'Continue', disabled: false, onClick: () => undefined },
    children: null,
  },
} satisfies Meta<typeof WizardShell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Mid-wizard, the badge-style indicator `TournamentSetupWizard` uses, with a breadcrumb and progress caption. */
export const MidWizardBadgeIndicator: Story = {
  args: {
    breadcrumb: 'Tournaments',
    progressCaption: '60% configured',
    children: (
      <div className="cl-platform-form-grid">
        <p>Rules step content goes here.</p>
      </div>
    ),
  },
};

/** The plain-number indicator `ProfileBuilderWizard`/`DescriptorBuilderWizard` use, with a problem and a server failure. */
export const PlainIndicatorWithProblemsAndFailures: Story = {
  args: {
    stepIndicatorVariant: 'plain',
    steps: STEPS.slice(0, 4),
    currentStepId: 'discipline',
    problems: ['Choose a discipline before continuing.'],
    failures: [{ key: 'stage-1', text: '[stage-1:format] Format is not supported.' }],
    failuresTestId: 'server-failures',
    primaryAction: { label: 'Author and install', disabled: true, onClick: () => undefined },
    children: (
      <div className="cl-platform-form-grid">
        <p>Discipline step content goes here.</p>
      </div>
    ),
  },
};
