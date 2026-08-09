import { useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  createControlApiClient,
  type CsvImportPreviewResponse,
  type ControlApiClient,
  type RegistrationResponse,
} from '../lib/api-client.js';
import { RegistrationReviewPage, type ReviewRegistrationRow } from './RegistrationReviewPage.js';
import { messages } from '../i18n/messages.en.js';

type LoadStatus = 'loading' | 'ready' | 'failed';

export function RegistrationReviewRoute({
  organizationAlias,
  tournamentAlias,
  client,
  now = new Date().toISOString(),
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly client?: ControlApiClient;
  readonly now?: string;
}): React.JSX.Element {
  const intl = useIntl();
  const api = useMemo(
    () => client ?? createControlApiClient({ fetch: globalThis.fetch.bind(globalThis) }),
    [client],
  );
  const [rows, setRows] = useState<readonly ReviewRegistrationRow[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [csv, setCsv] = useState<CsvImportPreviewResponse>();
  const [csvStatus, setCsvStatus] = useState('');
  const csvApi = api as Required<
    Pick<ControlApiClient, 'createCsvImport' | 'fetchCsvImport' | 'commitCsvImport'>
  >;

  useEffect(() => {
    let live = true;
    api
      .listRegistrations(organizationAlias, tournamentAlias)
      .then((loaded) => {
        if (!live) return;
        setRows(
          loaded.map((row) =>
            toReviewRow(
              row,
              intl.formatMessage(messages.registrationContactUnavailable),
              intl.formatMessage(messages.registrationExperienceUnrecorded),
            ),
          ),
        );
        setStatus('ready');
      })
      .catch(() => {
        if (live) setStatus('failed');
      });
    return () => {
      live = false;
    };
  }, [api, organizationAlias, tournamentAlias, intl]);

  if (status === 'loading' && rows.length === 0) {
    return (
      <p className="cl-inline-alert">
        <FormattedMessage {...messages.registrationLoading} />
      </p>
    );
  }
  if (status === 'failed' && rows.length === 0) {
    return (
      <p className="cl-inline-alert">
        <FormattedMessage {...messages.registrationLoadFailed} />
      </p>
    );
  }

  return (
    <>
      <section
        aria-label={intl.formatMessage(messages.registrationImportSection)}
        className="cl-card cl-chamfer cl-chamfer--control"
      >
        <label>
          <FormattedMessage {...messages.registrationCsvLabel} />
          <input
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) return;
              void file.text().then((sourceCsv) =>
                csvApi
                  .createCsvImport(organizationAlias, tournamentAlias, {
                    target: 'team',
                    sourceCsv,
                  })
                  .then((created) => {
                    setCsv(created);
                    setCsvStatus(intl.formatMessage(messages.registrationImportQueued));
                    return csvApi.fetchCsvImport(
                      organizationAlias,
                      tournamentAlias,
                      created.importId,
                    );
                  })
                  .then((preview) => {
                    setCsv(preview);
                    setCsvStatus(preview.status);
                  })
                  .catch(() =>
                    setCsvStatus(intl.formatMessage(messages.registrationImportCreateFailed)),
                  ),
              );
            }}
            type="file"
          />
        </label>
        {csvStatus && <p className="cl-inline-alert">{csvStatus}</p>}
        {csv?.preview && (
          <div>
            <p>
              {csv.preview.valid
                ? intl.formatMessage(messages.registrationPreviewValid)
                : intl.formatMessage(messages.registrationPreviewInvalid)}
            </p>
            {csv.preview.errors.map((error) => (
              <p key={error.message}>{error.message}</p>
            ))}
            {csv.preview.rows
              .filter((row) => row.errors.length > 0)
              .map((row) => (
                <p key={row.rowNumber}>
                  {intl.formatMessage(messages.registrationRow, {
                    rowNumber: row.rowNumber,
                    errors: row.errors.map((error) => error.message).join(', '),
                  })}
                </p>
              ))}
            <button
              disabled={!csv.preview.valid || csv.status !== 'review-ready'}
              onClick={() =>
                void csvApi
                  .commitCsvImport(organizationAlias, tournamentAlias, csv.importId, csv.sourceHash)
                  .then((next) => {
                    setCsv(next);
                    setCsvStatus(intl.formatMessage(messages.registrationImportConfirmed));
                  })
              }
              type="button"
            >
              <FormattedMessage {...messages.registrationConfirmImport} />
            </button>
          </div>
        )}
      </section>
      <RegistrationReviewPage
        organizationAlias={organizationAlias}
        tournamentName={tournamentAlias}
        rows={rows}
        now={now}
        onBulkReview={(request) =>
          api.bulkReview(organizationAlias, tournamentAlias, request).then((result) => {
            const updated = new Map(result.applied.map((one) => [one.entrantId, one]));
            setRows((current) =>
              current.map((row) => {
                const next = updated.get(row.entrantId);
                return next === undefined ? row : { ...row, status: next.status };
              }),
            );
          })
        }
        onReview={(entrantId, request) =>
          api
            .reviewRegistration(organizationAlias, tournamentAlias, entrantId, request)
            .then((next) =>
              setRows((current) =>
                current.map((row) =>
                  row.entrantId === next.entrantId ? { ...row, status: next.status } : row,
                ),
              ),
            )
        }
      />
    </>
  );
}

function toReviewRow(
  row: RegistrationResponse,
  contactUnavailableLabel: string,
  experienceUnrecordedLabel: string,
): ReviewRegistrationRow {
  const displayName = row.teamId ?? row.personId ?? row.entrantId;
  return {
    entrantId: row.entrantId,
    displayName,
    status: row.status,
    submittedAt: '',
    contactEmail: contactUnavailableLabel,
    // RegistrationResponse identifies the entrant, not its members. Do not
    // present the team identifier as a person until the API supplies members.
    teamMembers: [],
    experience: experienceUnrecordedLabel,
    requiresCheckIn: false,
  };
}
