import type { Meta, StoryObj } from '@storybook/react-vite';
import { EntityIdentityCell } from './entity-identity-cell.js';
import { StoryMatrix } from '../story-matrix.js';

const meta = {
  title: 'Admin/Molecules/EntityIdentityCell',
  component: EntityIdentityCell,
  argTypes: { email: { control: 'text' }, id: { control: 'text' } },
} satisfies Meta<typeof EntityIdentityCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { email: 'ana.lopez@example.org', id: '7f3c9a12-4b8e-4a51-9c0d-2e6b8f10a3d7' },
};

/**
 * The molecule derives its avatar initials from the local part of the address,
 * splitting on `.`, `_` and `-`. These are the cases where that derivation is
 * interesting: two parts, one part, no separator, and a local part so short it
 * falls back to `U`.
 *
 * This molecule holds no catalogue text — an address and an id are the same in
 * every language — so the language selector correctly changes nothing here.
 */
export const Matrix: Story = {
  args: { email: '', id: '' },
  render: function Render() {
    const id = '7f3c9a12-4b8e-4a51-9c0d-2e6b8f10a3d7';
    return (
      <StoryMatrix
        minColumn="260px"
        cells={[
          {
            label: 'dotted local part',
            children: <EntityIdentityCell email="ana.lopez@example.org" id={id} />,
          },
          {
            label: 'underscored',
            children: <EntityIdentityCell email="ana_lopez@example.org" id={id} />,
          },
          {
            label: 'single word',
            children: <EntityIdentityCell email="analopez@example.org" id={id} />,
          },
          {
            label: 'long address',
            children: (
              <EntityIdentityCell
                email="a.very.long.address.for.one.person@a-long-domain.example.org"
                id={id}
              />
            ),
          },
        ]}
      />
    );
  },
};
