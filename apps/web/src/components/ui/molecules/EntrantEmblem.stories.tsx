import type { Meta, StoryObj } from '@storybook/react-vite';
import { EntrantEmblem } from './EntrantEmblem.js';

const meta = {
  title: 'Public/EntrantEmblem',
  component: EntrantEmblem,
  args: {
    abbreviation: 'CPC',
    alt: 'Concepción Patín Club',
    size: 96,
    src: '/preview-fixtures/emblem-display.svg',
  },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof EntrantEmblem>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Emblem: Story = {};
export const ThreeCharacters: Story = { args: { src: undefined } };
export const SmallFourCharacters: Story = {
  args: { abbreviation: 'ESTM', size: 24, src: undefined },
};
export const FiveCharacters: Story = { args: { abbreviation: 'NORTE', src: undefined } };
export const EightCharacters: Story = { args: { abbreviation: 'PANAMERO', src: undefined } };
export const NoAbbreviation: Story = { args: { abbreviation: undefined, src: undefined } };
export const FailingUrl: Story = { args: { src: '/missing-emblem.png' } };
