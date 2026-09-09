import type { Meta, StoryObj } from '@storybook/react-vite';
import { DisciplineCard } from './DisciplineCard.js';

const meta = {
  title: 'Public/DisciplineCard',
  component: DisciplineCard,
} satisfies Meta<typeof DisciplineCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Football: Story = {
  args: {
    title: 'Fútbol 11v11',
    code: 'football-11v11',
    formatPills: ['single-elimination', 'quarter', '11v11', 'var-enabled'],
    installCommand: 'copalibre module install football-11v11',
  },
};

export const Basketball3x3: Story = {
  args: {
    title: 'Baloncesto 3x3 FIBA',
    code: 'basketball-3x3',
    formatPills: ['round-robin', 'half-court', '10min-limit'],
    installCommand: 'copalibre module install basketball-3x3',
  },
};
