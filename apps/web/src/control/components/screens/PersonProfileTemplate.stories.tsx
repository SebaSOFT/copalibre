import type { Meta, StoryObj } from '@storybook/react-vite';
import { PersonProfileTemplate } from '../screens/PersonProfileTemplate.js';
import { ORG, ids } from '../screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/PersonProfileTemplate',
  component: PersonProfileTemplate,
  args: {
    organizationAlias: ORG,
    personId: ids.person,
    person: {
      personId: ids.person,
      displayName: 'V. Kael',
      nationality: 'AR',
      naturalKey: { kind: 'member', value: 'MS-014' },
    },
  },
} satisfies Meta<typeof PersonProfileTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = {
  args: {
    person: { personId: ids.person, displayName: 'V. Kael' },
  },
};
