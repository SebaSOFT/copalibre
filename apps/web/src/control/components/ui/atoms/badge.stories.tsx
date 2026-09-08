import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { Badge } from './badge.js';
import { StoryMatrix } from '../story-matrix.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Atoms/Badge',
  component: Badge,
  argTypes: { label: { control: 'text' }, className: { control: 'text' } },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { label: 'Live' },
};

/**
 * Everything the design system actually defines for a badge: the base, and the
 * `--rank` modifier, which is a tabular-numeral treatment rather than a colour.
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
        ]}
      />
    );
  },
};

/**
 * The tone modifiers the product writes but the design system does not define.
 *
 * `cl-badge--live`, `--final`, `--upcoming`, `--stage`, `--muted` and
 * `--positive` are all written by components and Astro pages; the generated
 * stylesheet defines none of them. The only place any of them is styled is a
 * page-local `<style>` block on the single match page, so the same class means
 * "red" on that one page and nothing anywhere else.
 *
 * They render here exactly as they render everywhere but that page — identical
 * to the base badge — which is the point of showing them. Giving the tones an
 * owned home is `0214`'s work; this story is the evidence.
 */
export const UndefinedTones: Story = {
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
