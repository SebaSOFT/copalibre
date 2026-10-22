import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import { createControlApiClient, type ControlApiClient } from '../../lib/api-client.js';
import { type ReportRow } from '../../lib/reports.js';
import { controlTokenStore } from '../../session/token-store.js';
import { ReportReviewTemplate } from '../screens/ReportReviewTemplate.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { useResilientRead } from './use-resilient-read.js';

/**
 * The pending participant reports/disputes queue.
 *
 * Deliberately without a bulk action: the mitigation for "a flood of
 * low-quality disputes" is that this queue is reviewed one at a time, and a
 * dismiss here never touches a match result — an operator who wants to act
 * on a submission does so through the existing correction workflow
 * separately, citing this report's id.
 *
 * Fetches and mutates: the pending-reports load and
 * the dismiss mutation live here; `ReportReviewTemplate` composes the screen
 * from the resulting data.
 */
export function ReportReviewPage({
  organizationAlias,
  tournamentAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  const intl = useIntl();
  const api = useMemo(
    () =>
      client ??
      createControlApiClient({
        fetch: globalThis.fetch.bind(globalThis),
        accessToken: () => controlTokenStore.read(),
      }),
    [client],
  );
  const read = useResilientRead<readonly ReportRow[]>(
    `control-reports:${organizationAlias}:${tournamentAlias}`,
    async () =>
      ((await api.listPendingReports?.(organizationAlias, tournamentAlias)) ?? []).map(toRow),
    { thing: intl.formatMessage(messages.reportTitle) },
  );
  const rows = read.data ?? [];
  const setRows = read.update;

  function dismiss(reportId: string, reviewNote: string): void {
    void api
      .reviewReport?.(organizationAlias, tournamentAlias, reportId, {
        status: 'dismissed',
        ...(reviewNote === '' ? {} : { reviewNote }),
      })
      .then(() => setRows((current) => current.filter((row) => row.reportId !== reportId)));
  }

  return (
    <ReadState {...read} title={intl.formatMessage(messages.reportTitle)}>
      <ReportReviewTemplate onDismiss={dismiss} rows={rows} status="ready" />
    </ReadState>
  );
}

function toRow(response: {
  reportId: string;
  matchId: string;
  kind: string;
  submittedByPersonId: string;
  submittedAt: string;
  reason?: string;
  status: string;
  evidence: readonly {
    evidenceId: string;
    filename: string;
    validationStatus: string;
  }[];
}): ReportRow {
  return {
    reportId: response.reportId,
    matchId: response.matchId,
    kind: response.kind as ReportRow['kind'],
    submittedByPersonId: response.submittedByPersonId,
    submittedAt: response.submittedAt,
    ...(response.reason === undefined ? {} : { reason: response.reason }),
    status: response.status as ReportRow['status'],
    evidence: response.evidence.map((file) => ({
      evidenceId: file.evidenceId,
      filename: file.filename,
      validationStatus: file.validationStatus as ReportRow['evidence'][number]['validationStatus'],
    })),
  };
}
