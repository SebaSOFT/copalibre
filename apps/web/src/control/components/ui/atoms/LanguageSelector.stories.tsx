import type { Meta, StoryObj } from '@storybook/react-vite';
import { LanguageSelector } from './LanguageSelector.js';

const meta = {
  title: 'Admin/Atoms/LanguageSelector',
  component: LanguageSelector,
  argTypes: {
    currentLocale: {
      control: 'select',
      options: ['en', 'es', 'de', 'fr', 'it', 'pt', 'ru', 'zh'],
    },
  },
} satisfies Meta<typeof LanguageSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    currentLocale: 'es',
  },
};

export const English: Story = {
  args: {
    currentLocale: 'en',
  },
};

export const German: Story = {
  args: {
    currentLocale: 'de',
  },
};
