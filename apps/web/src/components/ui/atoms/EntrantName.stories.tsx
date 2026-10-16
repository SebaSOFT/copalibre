import type { Meta, StoryObj } from '@storybook/react-vite';
import { EntrantName } from './EntrantName.js';
import { publicIntl, sideSourceLabels } from '../../../lib/i18n/public-intl.js';
import { formatSideSource, sourceMatchLabel } from '../../../lib/side-source.js';

const meta = {
  title: 'Public/EntrantName',
  component: EntrantName,
  args: { fullName: 'Club Atlético Independiente' },
  argTypes: {
    fullName: { control: 'text' },
    abbreviation: { control: 'text' },
    inline: { control: 'boolean' },
    pending: { control: 'boolean' },
    compact: { control: 'boolean' },
  },
} satisfies Meta<typeof EntrantName>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { fullName: 'Club Atlético Independiente', abbreviation: 'CAI' },
};

/**
 * The component swaps to the abbreviation only when the full name overflows its
 * own box, measured with a `ResizeObserver`. Narrow the frame with the viewport
 * selector — 374px, then 188px — and watch each row switch as its width runs
 * out. That is the whole behaviour, and it is unobservable at a fixed width.
 */
export const WidthDriven: Story = {
  render: function Render() {
    const names: readonly (readonly [string, string | undefined])[] = [
      ['Club Atlético Independiente de Avellaneda', 'CAI'],
      ['Deportivo San Juan', 'DSJ'],
      ['Unión', 'UNI'],
      ['Club sin abreviatura registrada', undefined],
    ];
    return (
      <div style={{ display: 'grid', gap: 'var(--cl-space-3)' }}>
        {names.map(([fullName, abbreviation]) => (
          <div
            key={fullName}
            style={{ border: '1px solid var(--cl-border-muted)', padding: 'var(--cl-space-2)' }}
          >
            <EntrantName abbreviation={abbreviation} fullName={fullName} />
          </div>
        ))}
      </div>
    );
  },
};

/**
 * Without an abbreviation the full name stays, whatever the width — only a
 * persisted abbreviation may replace it, never a truncation this component
 * invents.
 */
export const NoAbbreviation: Story = {
  args: { fullName: 'Club sin abreviatura registrada', abbreviation: undefined },
};

/** Inline names inherit the heading or body typography of their consumer. */
export const Inline: Story = {
  args: { inline: true },
  render: (args) => (
    <>
      <h3 className="cl-card__title">
        <EntrantName {...args} />
      </h3>
      <p className="cl-card__description">
        <EntrantName {...args} />
      </p>
    </>
  ),
};

/**
 * An undecided side: its source in the secondary text token behind the upcoming-state glyph, so
 * the state reads without colour. The compact form is the catalogue's own short source wording.
 */
export const Pending: Story = {
  render: function Render() {
    const sources = sideSourceLabels(publicIntl('de'));
    const semi = { kind: 'winner-of' as const, nodeKey: 'SE-R2-M2', round: 2, position: 2 };
    const text = formatSideSource(semi, sources, sourceMatchLabel(semi, sources, 3));
    return (
      <div style={{ display: 'grid', gap: 'var(--cl-space-3)', maxWidth: '188px' }}>
        <EntrantName pending fullName={text.long} abbreviation={text.short} />
        <EntrantName compact pending fullName={text.long} abbreviation={text.short} />
      </div>
    );
  },
};
