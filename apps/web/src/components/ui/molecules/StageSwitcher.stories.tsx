import type { Meta, StoryObj } from '@storybook/react-vite';
import { StageSwitcher } from './StageSwitcher.js';

/**
 * The stage row on a stage or match page. The current stage is marked and
 * shown as the page; the others are links.
 */
const meta = {
  title: 'Public/StageSwitcher',
  component: StageSwitcher,
} satisfies Meta<typeof StageSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

const STAGES = [
  { stageNumber: 1, label: 'Groups', href: '/example/tournaments/cup/stages/1' },
  { stageNumber: 2, label: 'Cups', href: '/example/tournaments/cup/stages/2' },
  { stageNumber: 3, label: 'Stage 3', href: '/example/tournaments/cup/stages/3' },
];

export const OnGroups: Story = {
  args: { label: 'Tournament stages', stages: STAGES, currentStageNumber: 1 },
};

export const OnCups: Story = {
  args: { label: 'Tournament stages', stages: STAGES, currentStageNumber: 2 },
};

/** A single stage renders nothing, so the story shows an empty frame on purpose. */
export const SingleStage: Story = {
  args: { label: 'Tournament stages', stages: STAGES.slice(0, 1), currentStageNumber: 1 },
};
