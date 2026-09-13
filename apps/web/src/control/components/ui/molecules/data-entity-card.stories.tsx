import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { DataEntityCard, type DataEntityCardAccent } from './data-entity-card.js';
import { Button } from '../atoms/button.js';
import { StoryMatrix } from '../story-matrix.js';
import { storyText } from '../story-text.js';

const ACCENTS: readonly DataEntityCardAccent[] = ['live', 'upcoming', 'muted', 'positive'];

const meta = {
  title: 'Admin/Molecules/DataEntityCard',
  component: DataEntityCard,
  argTypes: {
    accent: { control: 'select', options: [undefined, ...ACCENTS] },
    title: { control: 'text' },
    titleHref: { control: 'text' },
  },
} satisfies Meta<typeof DataEntityCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { title: 'Copa Primavera', accent: 'live' },
  render: function Render(args) {
    const intl = useIntl();
    return (
      <DataEntityCard
        {...args}
        badge={{ label: intl.formatMessage(storyText.tournaments), state: 'state-live' }}
        metadata={[
          { label: intl.formatMessage(storyText.tournaments), value: '12', numeric: true },
          { label: intl.formatMessage(storyText.venuesAndOfficials), value: '4', numeric: true },
        ]}
      />
    );
  },
};

/**
 * The four accents against no accent at all. This is the view that found the
 * accents were inert: every one of them rendered identically until
 * `.cl-state--*` was defined, because the prop emitted a class nothing styled.
 */
export const Accents: Story = {
  args: { title: '' },
  render: function Render() {
    const intl = useIntl();
    const title = intl.formatMessage(storyText.settingsTitle);
    return (
      <StoryMatrix
        minColumn="260px"
        cells={[
          { label: 'none', children: <DataEntityCard title={title} /> },
          ...ACCENTS.map((accent) => ({
            label: accent,
            children: <DataEntityCard accent={accent} title={title} />,
          })),
        ]}
      />
    );
  },
};

/** Everything the molecule can carry at once, which is how a real card looks. */
export const Full: Story = {
  args: { title: '' },
  render: function Render() {
    const intl = useIntl();
    return (
      <DataEntityCard
        accent="live"
        actions={<Button variant="primary">{intl.formatMessage(storyText.save)}</Button>}
        badge={{ label: intl.formatMessage(storyText.tournaments), state: 'state-live' }}
        metadata={[
          { label: intl.formatMessage(storyText.venuesAndOfficials), value: '4', numeric: true },
          { label: intl.formatMessage(storyText.rolesTitle), value: '18', numeric: true },
          { label: intl.formatMessage(storyText.settingsTitle), value: '2026-09-08' },
        ]}
        title={intl.formatMessage(storyText.platformTitle)}
        titleHref="#"
      />
    );
  },
};

/** Title only: no badge, no metadata, no actions — every optional slot empty. */
export const TitleOnly: Story = {
  args: { title: '' },
  render: function Render() {
    const intl = useIntl();
    return <DataEntityCard title={intl.formatMessage(storyText.rolesTitle)} />;
  },
};
