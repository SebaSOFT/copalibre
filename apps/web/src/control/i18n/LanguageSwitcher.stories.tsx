import type { Meta, StoryObj } from '@storybook/react-vite';
import { LanguageSwitcher } from './LanguageSwitcher.js';

const meta = {
  title: 'Admin/i18n/LanguageSwitcher',
  component: LanguageSwitcher,
  args: {
    value: 'en',
    onChange: () => undefined,
  },
} satisfies Meta<typeof LanguageSwitcher>;
export default meta;
type Story = StoryObj<typeof meta>;
export const English: Story = {};
export const Spanish: Story = { args: { value: 'es' } };
export const French: Story = { args: { value: 'fr' } };
