import type { Meta, StoryObj } from '@storybook/react-vite';
import { EntityIdentityCell } from './entity-identity-cell.js';
import { StoryMatrix } from '../story-matrix.js';

const meta = {
  title: 'Admin/Molecules/EntityIdentityCell',
  component: EntityIdentityCell,
  argTypes: { email: { control: 'text' } },
} satisfies Meta<typeof EntityIdentityCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { email: 'ana.lopez@example.org' },
};

/**
 * The molecule derives its avatar initials from the local part of the address,
 * splitting on `.`, `_` and `-`. These are the cases where that derivation is
 * interesting: two parts, one part, no separator, and a local part so short it
 * falls back to `U`.
 *
 * This molecule holds no catalogue text, so the language selector correctly
 * changes nothing here.
 */
export const Matrix: Story = {
  args: { email: '' },
  render: function Render() {
    return (
      <StoryMatrix
        minColumn="260px"
        cells={[
          {
            label: 'dotted local part',
            children: <EntityIdentityCell email="ana.lopez@example.org" />,
          },
          {
            label: 'underscored',
            children: <EntityIdentityCell email="ana_lopez@example.org" />,
          },
          {
            label: 'single word',
            children: <EntityIdentityCell email="analopez@example.org" />,
          },
          {
            label: 'long address',
            children: (
              <EntityIdentityCell email="a.very.long.address.for.one.person@a-long-domain.example.org" />
            ),
          },
        ]}
      />
    );
  },
};
