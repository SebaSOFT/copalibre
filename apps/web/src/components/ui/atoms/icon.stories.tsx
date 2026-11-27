import type { Meta, StoryObj } from '@storybook/react-vite';
import { Icon } from './icon.js';

const meta = {
  title: 'Public/Atoms/Icon',
  component: Icon,
  args: { name: 'language', size: 20 },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LanguageGlyph: Story = {};
