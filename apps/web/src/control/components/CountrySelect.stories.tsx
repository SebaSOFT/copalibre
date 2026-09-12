import type { Meta, StoryObj } from '@storybook/react-vite';
import { CountrySelect } from './CountrySelect.js';

const meta = {
  title: 'Admin/Screens/CountrySelect',
  component: CountrySelect,
  args: { value: 'AR', onChange: () => undefined },
} satisfies Meta<typeof CountrySelect>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Unselected: Story = { args: { value: undefined } };
