import type { Meta, StoryObj } from '@storybook/react-vite';
import { TvEmblem } from './TvEmblem.js';

const monogram = <span className="tv-table-club-monogram">CAU</span>;

const meta = {
  title: 'TV/Kiosk & Full-Frame Widget/TvEmblem',
  component: TvEmblem,
  args: {
    alt: 'Atletico Union',
    className: 'tv-table-club-emblem',
    fallback: monogram,
    src: '/organizations/panamericano-demo/clubs/atletico-union/emblem',
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TvEmblem>;
export default meta;
type Story = StoryObj<typeof meta>;
/** The club has no emblem, or its request failed: the monogram stands in. */
export const WithoutEmblem: Story = { args: { src: undefined } };
/** The emblem request fails, so the image gives way to the monogram. */
export const EmblemFails: Story = { args: { src: '/missing-emblem.png' } };
