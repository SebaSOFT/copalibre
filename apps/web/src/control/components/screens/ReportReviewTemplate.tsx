import { FormattedMessage, useIntl } from 'react-intl';
import { KIND_LABEL, summaryOf, type ReportRow } from '../../lib/reports.js';
import { messages } from '../../i18n/messages.en.js';
import { Badge } from '../ui/atoms/badge.js';
import { Button } from '../ui/atoms/button.js';
import { Card } from '../ui/atoms/card.js';
import { Alert } from '../ui/atoms/alert.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';

type LoadStatus = 'loading' | 'ready' | 'failed';

/**
 * Composes the screen from the data `ReportReviewPage` supplies (openspec
 * 0225 task 6.2): no API client reference — `onDismiss` is the only call
 * back to the page.
 */
export function ReportReviewTemplate({
  onDismiss,
  rows,
  status,
}: {
  readonly onDismiss: (reportId: string, reviewNote: string) => void;
  readonly rows: readonly ReportRow[];
  readonly status: LoadStatus;
}): React.JSX.Element {
  const intl = useIntl();

  const listingNode = (
    <Card
      aria-label={intl.formatMessage(messages.reportSectionLabel)}
      className="cl-chamfer cl-chamfer--control"
    >
      {status === 'loading' && rows.length === 0 && (
        <Alert tone="info">
          <FormattedMessage {...messages.reportLoading} />
        </Alert>
      )}
      {status === 'failed' && rows.length === 0 && (
        <Alert tone="destructive">
          <FormattedMessage {...messages.reportLoadFailed} />
        </Alert>
      )}
      {status === 'ready' && rows.length === 0 && (
        <p>
          <FormattedMessage {...messages.reportEmpty} />
        </p>
      )}
      <ul>
        {rows.map((row) => (
          <li key={row.reportId}>
            <Card>
              <Badge label={intl.formatMessage(KIND_LABEL[row.kind])} />
              <p>{summaryOf(row) ?? intl.formatMessage(messages.reportGenericSummary)}</p>
              <p>
                <time dateTime={row.submittedAt}>{row.submittedAt}</time>
              </p>
              {row.evidence.length > 0 && (
                <ul aria-label={intl.formatMessage(messages.reportAttachedEvidence)}>
                  {row.evidence.map((file) => (
                    <li key={file.evidenceId}>
                      {file.filename} — {file.validationStatus}
                    </li>
                  ))}
                </ul>
              )}
              <Button onClick={() => onDismiss(row.reportId, '')} type="button" variant="secondary">
                <FormattedMessage {...messages.reportDismiss} />
              </Button>
            </Card>
          </li>
        ))}
      </ul>
    </Card>
  );

  return (
    <ListScreenLayout
      listing={listingNode}
      title={<FormattedMessage {...messages.reportTitle} />}
    />
  );
}
