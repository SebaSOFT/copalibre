import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { EntityIdentityCell } from './entity-identity-cell.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Molecules/EntityIdentityCell',
  component: EntityIdentityCell,
  argTypes: { abbreviation: { control: 'text' }, emblemSrc: { control: 'text' } },
} satisfies Meta<typeof EntityIdentityCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { name: 'Liga Mendocina' },
  render: function Render() {
    const intl = useIntl();
    return (
      <EntityIdentityCell
        abbreviation="LM"
        meta={`${intl.formatMessage(storyText.country)} · Argentina`}
        name="Liga Mendocina"
      />
    );
  },
};

export const EmailCompatibility: Story = {
  args: { email: 'ana.lopez@example.org' },
};
