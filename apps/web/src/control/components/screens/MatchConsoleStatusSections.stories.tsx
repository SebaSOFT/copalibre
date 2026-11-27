import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { consoleProjection } from '../screen-story-fixtures.js';
import { AlertsSection, StatusSection } from './MatchConsoleStatusSections.js';

function AlertsStory(props: {
  readonly lastSyncedAt: number | undefined;
  readonly stale: boolean;
  readonly status:
    { readonly kind: 'ready' } | { readonly kind: 'error'; readonly message: string };
}) {
  const intl = useIntl();
  return (
    <AlertsSection
      intl={intl}
      lastSyncedAt={props.lastSyncedAt}
      onDismissMutation={() => undefined}
      pendingMutations={[]}
      stale={props.stale}
      status={props.status}
    />
  );
}

function StatusStory() {
  const intl = useIntl();
  return (
    <StatusSection
      activeSegment={consoleProjection.segments[0]}
      intl={intl}
      matchStatus={consoleProjection.status}
    />
  );
}

const meta = {
  title: 'Admin/Screens/MatchConsoleStatusSections',
  component: StatusSection,
} satisfies Meta<typeof StatusSection>;
export default meta;

/** The status line and clock ring for a live match. */
export const Live: StoryObj = {
  render: () => <StatusStory />,
};
export const Alerts: StoryObj = {
  render: () => <AlertsStory lastSyncedAt={undefined} stale={false} status={{ kind: 'ready' }} />,
};
export const StaleProjection: StoryObj = {
  render: () => <AlertsStory lastSyncedAt={1_700_000_000_000} stale status={{ kind: 'ready' }} />,
};
export const ErrorStatus: StoryObj = {
  render: () => (
    <AlertsStory
      lastSyncedAt={undefined}
      stale={false}
      status={{ kind: 'error', message: 'The console could not load.' }}
    />
  ),
};
