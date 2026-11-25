import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { messages } from '../../../lib/i18n/public-messages.en.js';
import { StageSwitcher, type StageSwitcherItem } from './StageSwitcher.js';

/**
 * The stage row on a stage or match page. The current stage is marked and
 * shown as the page; the others are links. Its text is formatted from the
 * public catalogue's descriptors, so the workbench language applies to it.
 */
const meta = {
  title: 'Public/StageSwitcher',
  component: StageSwitcher,
} satisfies Meta<typeof StageSwitcher>;

export default meta;
type Story = StoryObj;

const TOURNAMENT = '/example/tournaments/cup';

/** Builds the switcher's items from the stage numbers, labelled by the stage descriptor. */
function StoryStageSwitcher({
  stageNumbers,
  currentStageNumber,
}: {
  readonly stageNumbers: readonly number[];
  readonly currentStageNumber: number;
}) {
  const intl = useIntl();
  const stages: readonly StageSwitcherItem[] = stageNumbers.map((stageNumber) => ({
    stageNumber,
    label: intl.formatMessage(messages.breadcrumbStage, { stage: stageNumber }),
    href: `${TOURNAMENT}/stages/${stageNumber}`,
  }));
  return (
    <StageSwitcher
      currentStageNumber={currentStageNumber}
      label={intl.formatMessage(messages.stageSwitcherLabel)}
      stages={stages}
    />
  );
}

export const OnFirstStage: Story = {
  render: () => <StoryStageSwitcher stageNumbers={[1, 2, 3]} currentStageNumber={1} />,
};

export const OnLaterStage: Story = {
  render: () => <StoryStageSwitcher stageNumbers={[1, 2, 3]} currentStageNumber={2} />,
};

/** A single stage renders nothing, so the story shows an empty frame on purpose. */
export const SingleStage: Story = {
  render: () => <StoryStageSwitcher stageNumbers={[1]} currentStageNumber={1} />,
};
