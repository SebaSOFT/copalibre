import type { Meta, StoryObj } from '@storybook/react-vite';
import { QualificationTemplate } from './QualificationTemplate.js';
import { ORG, TOURNAMENT, qualificationPreview } from '../screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/QualificationTemplate',
  component: QualificationTemplate,
  args: {
    organizationAlias: ORG,
    tournamentAlias: TOURNAMENT,
    stageNumber: 2,
    state: { kind: 'loaded', preview: qualificationPreview('ready') },
    onConfirm: async () => undefined,
  },
} satisfies Meta<typeof QualificationTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Groups complete: every position names its entrant and the confirm action is offered. */
export const Loaded: Story = {};

/** No promotion plan routes qualifiers to this stage. */
export const Empty: Story = { args: { state: { kind: 'empty' } } };

export const Failed: Story = { args: { state: { kind: 'failed' } } };

export const Loading: Story = { args: { state: { kind: 'loading' } } };

/** The prior stage is still being played: no entrants and no confirm action. */
export const Incomplete: Story = {
  args: { state: { kind: 'loaded', preview: qualificationPreview('incomplete') } },
};

/** A cut-line tie names the tied entrants and the position, instead of a confirm action. */
export const Tied: Story = {
  args: { state: { kind: 'loaded', preview: qualificationPreview('tied') } },
};

/** A result changed after the confirmation: both entrants shown, re-confirm offered. */
export const Stale: Story = {
  args: { state: { kind: 'loaded', preview: qualificationPreview('stale') } },
};

export const Confirmed: Story = {
  args: { state: { kind: 'loaded', preview: qualificationPreview('confirmed') } },
};

/** The longest wording at the narrowest supported width. */
export const TiedGermanAt188: Story = {
  args: { state: { kind: 'loaded', preview: qualificationPreview('tied') } },
  globals: { locale: 'de' },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '188px' }}>
        <Story />
      </div>
    ),
  ],
};
