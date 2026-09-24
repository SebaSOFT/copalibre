import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { Badge } from './badge.js';
import { StoryMatrix } from '../story-matrix.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Atoms/Badge',
  component: Badge,
  argTypes: {
    label: { control: 'text' },
    className: { control: 'text' },
    variant: { control: 'inline-radio', options: ['default', 'eyebrow', 'section'] },
    dot: { control: 'boolean' },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { label: 'Live' },
};

/**
 * Base shape, rank treatment, and operational chrome variants.
 */
export const Matrix: Story = {
  args: { label: '' },
  render: function Render() {
    const intl = useIntl();
    const label = intl.formatMessage(storyText.tournaments);
    return (
      <StoryMatrix
        minColumn="160px"
        cells={[
          { label: 'base', children: <Badge label={label} /> },
          { label: 'rank', children: <Badge className="cl-badge--rank" label="4" /> },
          { label: 'eyebrow', children: <Badge label={label} variant="eyebrow" /> },
          { label: 'section', children: <Badge label={label} variant="section" /> },
          { label: 'eyebrow + dot', children: <Badge dot label={label} variant="eyebrow" /> },
        ]}
      />
    );
  },
};

/** All six product tones resolve through generated badge tokens (0268). */
export const Tones: Story = {
  args: { label: '' },
  render: function Render() {
    const intl = useIntl();
    const label = intl.formatMessage(storyText.tournaments);
    return (
      <StoryMatrix
        minColumn="160px"
        cells={['live', 'final', 'upcoming', 'stage', 'muted', 'positive'].map((tone) => ({
          label: tone,
          children: <Badge className={`cl-badge--${tone}`} label={label} />,
        }))}
      />
    );
  },
};

/** A long translated label at 188px is where a badge stops fitting its row. */
export const LongLabel: Story = {
  args: { label: '' },
  render: function Render() {
    const intl = useIntl();
    return <Badge label={intl.formatMessage(storyText.venuesAndOfficials)} />;
  },
};

/**
 * The operational-tag family — 0223's reference scenario.
 *
 * A section label carrying a German compound at 188px is the case the variant
 * exists to survive: it wraps and stays complete rather than being clipped,
 * which a fixed-height chip would not do. Set the workbench language to German
 * and the viewport to 188px to see it.
 */
export const OperationalTags: Story = {
  args: { label: '' },
  render: function Render() {
    const intl = useIntl();
    return (
      <div style={{ display: 'grid', gap: 'var(--cl-space-3)', justifyItems: 'start' }}>
        <Badge label={intl.formatMessage(storyText.tournaments)} variant="eyebrow" />
        <Badge dot label={intl.formatMessage(storyText.platformTitle)} variant="eyebrow" />
        <Badge label={intl.formatMessage(storyText.venuesAndOfficials)} variant="section" />
        <Badge label={intl.formatMessage(storyText.savePromotionPlan)} variant="section" />
      </div>
    );
  },
};
