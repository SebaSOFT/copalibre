import type { SupportedLanguage } from '@copalibre/domain';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TvTeamSide } from './TvTeamSide.js';
import { publicIntl, tvStatisticsLabels } from '../../lib/i18n/public-intl.js';

const meta = {
  title: 'TV/Kiosk & Full-Frame Widget/TvTeamSide',
  component: TvTeamSide,
  args: {
    name: 'Club Atlético Independiente',
    abbreviation: 'CAI',
    clubId: 'club-independiente',
    roleLabel: tvStatisticsLabels(publicIntl('en')).homeSide,
  },
  render: (args, context) => {
    const language = (context.globals.locale ?? 'en') as SupportedLanguage;
    return <TvTeamSide {...args} roleLabel={tvStatisticsLabels(publicIntl(language)).homeSide} />;
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TvTeamSide>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Monogram: Story = {};
export const WithEmblem: Story = {
  args: {
    clubs: [
      { clubId: 'club-independiente', name: 'Club Atlético Independiente', emblemUrl: 'obj-1' },
    ],
  },
};
