import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { MatchConsoleTemplate } from './match-console-template.js';
import { ClockRing } from '../organisms/clock-ring.js';
import { Card, CardContent, CardHeader, CardTitle } from '../atoms/card.js';
import { Badge } from '../atoms/badge.js';
import { Button } from '../atoms/button.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Templates/MatchConsoleTemplate',
  component: MatchConsoleTemplate,
  args: { title: '', status: null, primary: null, rail: null },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof MatchConsoleTemplate>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A live console mid-match: every optional slot filled, which is the state that
 * otherwise costs a seeded tournament and a running match to reach.
 */
export const Live: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <MatchConsoleTemplate
        alerts={<p className="cl-inline-alert">{intl.formatMessage(storyText.saved)}</p>}
        breadcrumb={intl.formatMessage(storyText.platformTitle)}
        primary={
          <Card>
            <CardHeader>
              <CardTitle>{intl.formatMessage(storyText.tournaments)}</CardTitle>
            </CardHeader>
            <CardContent>
              <Button variant="primary">{intl.formatMessage(storyText.save)}</Button>
            </CardContent>
          </Card>
        }
        primaryLabel={intl.formatMessage(storyText.tournaments)}
        rail={
          <Card>
            <CardHeader>
              <CardTitle>{intl.formatMessage(storyText.reportTitle)}</CardTitle>
            </CardHeader>
            <CardContent>{intl.formatMessage(storyText.empty)}</CardContent>
          </Card>
        }
        railLabel={intl.formatMessage(storyText.reportTitle)}
        scoreboard={<ClockRing durationSeconds={2700} elapsedSeconds={1350} />}
        sectionLabel={intl.formatMessage(storyText.platformTitle)}
        status={<Badge label={intl.formatMessage(storyText.tournaments)} />}
        syncStatus={<span>{intl.formatMessage(storyText.loading)}</span>}
        title={intl.formatMessage(storyText.settingsTitle)}
      />
    );
  },
};

/**
 * Only the required slots. The two-column layout has to survive an empty rail
 * and no scoreboard, which is how the console renders before a match starts.
 */
export const Minimal: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <MatchConsoleTemplate
        primary={<Card>{intl.formatMessage(storyText.loading)}</Card>}
        rail={<Card>{intl.formatMessage(storyText.empty)}</Card>}
        status={<Badge label={intl.formatMessage(storyText.tournaments)} />}
        title={intl.formatMessage(storyText.settingsTitle)}
      />
    );
  },
};
