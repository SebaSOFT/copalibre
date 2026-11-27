import { Alert } from '../ui/atoms/alert.js';
import { FormattedMessage, useIntl } from 'react-intl';
import { type ControlApiClient, type StatisticsRebuildResponse } from '../../lib/api-client.js';
import { Button } from '../ui/atoms/button.js';
import { Card } from '../ui/atoms/card.js';
import { Input } from '../ui/atoms/input.js';
import { Inline } from '../ui/atoms/layout/inline.js';
import { Field } from '../ui/molecules/field.js';
import { messages as controlMessages } from '../../i18n/messages.en.js';
import { whoCan } from './preferences-permissions.js';

export function StatisticsRebuildSection({
  api,
  canRebuild,
  dismissedRebuildResult,
  onDismissRebuildResult,
  onPreviewRebuild,
  organizationAlias,
  rebuildBusy,
  rebuildResult,
  rebuildTournamentAlias,
  setRebuildTournamentAlias,
}: {
  readonly api: ControlApiClient;
  readonly canRebuild: boolean;
  readonly dismissedRebuildResult: boolean;
  readonly onDismissRebuildResult: () => void;
  readonly onPreviewRebuild: () => Promise<void>;
  readonly organizationAlias: string | undefined;
  readonly rebuildBusy: boolean;
  readonly rebuildResult: StatisticsRebuildResponse | undefined;
  readonly rebuildTournamentAlias: string;
  readonly setRebuildTournamentAlias: (alias: string) => void;
}): React.JSX.Element | null {
  const intl = useIntl();
  if (organizationAlias === undefined) return null;

  if (!canRebuild) {
    return (
      <Card
        aria-label={intl.formatMessage(controlMessages.statisticsRebuildHeading)}
        className="cl-chamfer cl-chamfer--control cl-preferences-panel"
      >
        <h2>
          <FormattedMessage {...controlMessages.statisticsRebuildHeading} />
        </h2>
        <p>
          <FormattedMessage {...controlMessages.statisticsRebuildDescription} />
        </p>
        <p>
          {intl.formatMessage(
            controlMessages.orgSectionWithheld,
            whoCan(intl, 'org.rebuild-statistics'),
          )}
        </p>
      </Card>
    );
  }

  return (
    <Card
      aria-label={intl.formatMessage(controlMessages.statisticsRebuildHeading)}
      className="cl-chamfer cl-chamfer--control cl-preferences-panel"
    >
      <h2>
        <FormattedMessage {...controlMessages.statisticsRebuildHeading} />
      </h2>
      <p>
        <FormattedMessage {...controlMessages.statisticsRebuildDescription} />
      </p>

      {rebuildResult && !dismissedRebuildResult && (
        <Alert
          dismissLabel={intl.formatMessage(controlMessages.toastDismiss)}
          onDismiss={onDismissRebuildResult}
          tone="info"
        >
          {intl.formatMessage(controlMessages.statisticsRebuildResult, {
            matches: rebuildResult.matches,
          })}
        </Alert>
      )}

      <Inline align="end" gap="4" wrap>
        <Field
          id="rebuild-tournament"
          label={intl.formatMessage(controlMessages.statisticsRebuildTournamentLabel)}
        >
          <Input
            id="rebuild-tournament"
            onChange={(event) => setRebuildTournamentAlias(event.target.value)}
            placeholder={intl.formatMessage(controlMessages.statisticsRebuildTournamentPlaceholder)}
            type="text"
            value={rebuildTournamentAlias}
          />
        </Field>
        <Button
          disabled={!api.rebuildStatistics || rebuildBusy}
          onClick={() => void onPreviewRebuild()}
          type="button"
        >
          <FormattedMessage {...controlMessages.statisticsRebuildTrigger} />
        </Button>
      </Inline>
    </Card>
  );
}
