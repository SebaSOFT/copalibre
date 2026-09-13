import { defineMessages, useIntl } from 'react-intl';
import { type TournamentResponse } from '../../lib/api-client.js';
import { controlLinkClick } from '../../lib/control-navigation.js';
import { Badge } from '../ui/atoms/badge.js';
import { Card } from '../ui/atoms/card.js';
import { Inline } from '../ui/atoms/layout/inline.js';
import { Stack } from '../ui/atoms/layout/stack.js';
import { messages } from '../../i18n/messages.en.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';

// openspec 0225 task 8.3 (found by /impeccable critique): these two link
// labels were hardcoded Spanish literals with no message id at all. Local
// rather than in `messages.en.ts` — the same `auth.*`/`invitation.*`
// namespace gap task 2.6 and this task's own AcceptInvitationForm fix
// already restated in English: no locale catalogue has these ids, so every
// locale falls back to `defaultMessage`, and `check-atomic-composition.mjs`'s
// catalogue-completeness rule only walks the shared `messages.en.ts` file,
// not a component's own local descriptors.
const localMessages = defineMessages({
  viewMatches: { id: 'control.liveConsole.viewMatches', defaultMessage: 'View matches' },
  matchReports: { id: 'control.liveConsole.matchReports', defaultMessage: 'Match reports' },
});

/**
 * Composes the screen from the data `LiveConsolePage` supplies (openspec
 * 0225 task 6.2): purely presentational, no API client reference and no
 * screen state of its own.
 */
export function LiveConsoleTemplate({
  loading,
  organizationAlias,
  tournaments,
}: {
  readonly loading: boolean;
  readonly organizationAlias: string;
  readonly tournaments: readonly TournamentResponse[];
}): React.JSX.Element {
  const intl = useIntl();

  const listingNode = (
    <Stack className="cl-live-console" gap="6">
      <p style={{ margin: 0, color: 'var(--cl-text-muted)' }}>
        {intl.formatMessage(messages.liveConsoleSubtitle)}
      </p>

      {loading ? (
        <p>{intl.formatMessage(messages.liveConsoleLoading)}</p>
      ) : tournaments.length === 0 ? (
        <Card>
          <div style={{ padding: 'var(--cl-space-6)', textAlign: 'center' }}>
            <p style={{ margin: '0 0 var(--cl-space-4)', color: 'var(--cl-text-muted)' }}>
              {intl.formatMessage(messages.liveConsoleNoActiveTournaments)}
            </p>
            <a
              className="cl-btn cl-btn--primary cl-focusable"
              href={`/control/${organizationAlias}/tournaments/new`}
              onClick={controlLinkClick(`/control/${organizationAlias}/tournaments/new`)}
            >
              {intl.formatMessage(messages.liveConsoleCreateTournament)}
            </a>
          </div>
        </Card>
      ) : (
        <Stack gap="4">
          {tournaments.map((tournament) => (
            <Card key={tournament.tournamentId}>
              <Stack gap="3" padding="4">
                <Inline align="center" gap="2" justify="between" wrap>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 'var(--cl-font-size-lg)' }}>
                      {tournament.name}
                    </h2>
                    <span
                      style={{ fontSize: 'var(--cl-font-size-sm)', color: 'var(--cl-text-muted)' }}
                    >
                      {tournament.alias}
                    </span>
                  </div>
                  <Badge
                    className={
                      tournament.status === 'started'
                        ? 'cl-state--live'
                        : tournament.status === 'finished'
                          ? 'cl-state--positive'
                          : 'cl-state--upcoming'
                    }
                    label={intl.formatMessage(
                      tournament.status === 'started'
                        ? messages.lifecycleLive
                        : tournament.status === 'finished'
                          ? messages.lifecycleFinished
                          : messages.lifecycleUpcoming,
                    )}
                  />
                </Inline>

                <Inline gap="3" wrap>
                  <a
                    className="cl-btn cl-btn--secondary cl-focusable"
                    href={`/control/${organizationAlias}/tournaments/${tournament.alias}/matches-view`}
                    onClick={controlLinkClick(
                      `/control/${organizationAlias}/tournaments/${tournament.alias}/matches-view`,
                    )}
                  >
                    {intl.formatMessage(localMessages.viewMatches)}
                  </a>
                  <a
                    className="cl-btn cl-btn--secondary cl-focusable"
                    href={`/control/${organizationAlias}/tournaments/${tournament.alias}/reports`}
                    onClick={controlLinkClick(
                      `/control/${organizationAlias}/tournaments/${tournament.alias}/reports`,
                    )}
                  >
                    {intl.formatMessage(localMessages.matchReports)}
                  </a>
                </Inline>
              </Stack>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );

  return (
    <ListScreenLayout listing={listingNode} title={intl.formatMessage(messages.navLiveConsole)} />
  );
}
