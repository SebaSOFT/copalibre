import type { Meta, StoryObj } from '@storybook/react-vite';
import { EntrantName } from './EntrantName.js';

const meta = {
  title: 'Public/EntrantName',
  component: EntrantName,
  args: { fullName: 'Club Atlético Independiente' },
  argTypes: {
    fullName: { control: 'text' },
    abbreviation: { control: 'text' },
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
