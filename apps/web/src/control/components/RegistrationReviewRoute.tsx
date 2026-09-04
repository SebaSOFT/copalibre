import { useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  createControlApiClient,
  type CsvImportPreviewResponse,
  type ControlApiClient,
  type RegistrationResponse,
} from '../lib/api-client.js';
import { controlLinkClick } from '../lib/control-navigation.js';
import { controlTokenStore } from '../session/token-store.js';
import { AbbreviationReviewSection } from './AbbreviationReviewSection.js';
import { RegistrationReviewPage, type ReviewRegistrationRow } from './RegistrationReviewPage.js';
import { Button } from './ui/atoms/button.js';
import { Card } from './ui/atoms/card.js';
import { FormField } from './ui/molecules/form-field.js';
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
    () =>
      client ??
      createControlApiClient({
        fetch: globalThis.fetch.bind(globalThis),
        accessToken: () => controlTokenStore.read(),
      }),
    [client],
  );
  const csvApi = api as Required<
    Pick<ControlApiClient, 'createCsvImport' | 'fetchCsvImport' | 'commitCsvImport'>
  >;

  const [rows, setRows] = useState<readonly ReviewRegistrationRow[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [csv, setCsv] = useState<CsvImportPreviewResponse>();
  const [csvStatus, setCsvStatus] = useState('');
  const [abbreviationCandidates, setAbbreviationCandidates] = useState<
    readonly RegistrationResponse[]
  >([]);

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

  useEffect(() => {
    let live = true;
    const listEntrantsNeedingAbbreviation = api.listEntrantsNeedingAbbreviation;
    (listEntrantsNeedingAbbreviation
      ? listEntrantsNeedingAbbreviation(organizationAlias, tournamentAlias)
      : Promise.resolve([])
    )
      .then((loaded) => {
        if (live) setAbbreviationCandidates(loaded);
      })
      .catch(() => {
        // A quiet, empty-by-default section (design.md) — a failed load
        // just leaves it empty rather than adding a second error state.
      });
    return () => {
      live = false;
    };
  }, [api, organizationAlias, tournamentAlias]);

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
      <a
        className="cl-focusable"
        href={`/control/${organizationAlias}/tournaments/${tournamentAlias}/settings`}
        onClick={controlLinkClick(
          `/control/${organizationAlias}/tournaments/${tournamentAlias}/settings`,
        )}
      >
        <FormattedMessage {...messages.tournamentSettingsLink} />
      </a>
      <Card
        aria-label={intl.formatMessage(messages.registrationImportSection)}
        className="cl-chamfer cl-chamfer--control"
      >
        <FormField
          id="registration-csv-file"
          label={intl.formatMessage(messages.registrationCsvLabel)}
        >
          <input
            accept=".csv,text/csv"
            aria-label={intl.formatMessage(messages.registrationCsvLabel)}
            className="cl-input cl-input--default cl-focusable"
            id="registration-csv-file"
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
        </FormField>
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
            <Button
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
            </Button>
          </div>
        )}
      </Card>
      <AbbreviationReviewSection
        onSetAbbreviation={
          api.setEntrantAbbreviation &&
          ((entrantId, abbreviation) =>
            api
              .setEntrantAbbreviation?.(organizationAlias, tournamentAlias, entrantId, {
                abbreviation,
              })
              .then(() => {
                setAbbreviationCandidates((current) =>
                  current.filter((row) => row.entrantId !== entrantId),
                );
              }))
        }
        rows={abbreviationCandidates.map((row) => ({
          entrantId: row.entrantId,
          displayName: row.displayName ?? row.teamId ?? row.personId ?? row.entrantId,
        }))}
      />
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
        onSetNationality={
          api.setPersonNationality &&
          ((personId, nationality) =>
            api.setPersonNationality?.(organizationAlias, personId, nationality).then((next) => {
              setRows((current) =>
                current.map((row) =>
                  row.personId === personId
                    ? { ...row, nationality: next.nationality ?? undefined }
                    : row,
                ),
              );
            }))
        }
        onUploadPhoto={
          api.uploadPersonPhoto &&
          ((personId, request) =>
            api.uploadPersonPhoto?.(organizationAlias, personId, request).then((next) => {
              setRows((current) =>
                current.map((row) =>
                  row.personId === personId ? { ...row, photoObjectId: next.objectId } : row,
                ),
              );
            }))
        }
        onAddPerson={
          api.createPerson &&
          ((request) =>
            api.createPerson?.(organizationAlias, tournamentAlias, request).then((created) => {
              setRows((current) => [
                ...current,
                toReviewRow(
                  created,
                  intl.formatMessage(messages.registrationContactUnavailable),
                  intl.formatMessage(messages.registrationExperienceUnrecorded),
                ),
              ]);
            }))
        }
        onAddTeam={
          api.createTeam &&
          ((request) =>
            api.createTeam?.(organizationAlias, tournamentAlias, request).then((created) => {
              setRows((current) => [
                ...current,
                toReviewRow(
                  created,
                  intl.formatMessage(messages.registrationContactUnavailable),
                  intl.formatMessage(messages.registrationExperienceUnrecorded),
                ),
              ]);
            }))
        }
        onEditPersonIdentity={
          api.updatePersonIdentity &&
          ((personId, request) =>
            api
              .updatePersonIdentity?.(organizationAlias, tournamentAlias, personId, request)
              .then((next) => {
                setRows((current) =>
                  current.map((row) =>
                    row.personId === personId ? { ...row, displayName: next.displayName } : row,
                  ),
                );
              }))
        }
        onEditTeamIdentity={
          api.updateTeamIdentity &&
          ((teamId, request) =>
            api
              .updateTeamIdentity?.(organizationAlias, tournamentAlias, teamId, request)
              .then((next) => {
                setRows((current) =>
                  current.map((row) =>
                    row.teamId === teamId ? { ...row, displayName: next.name } : row,
                  ),
                );
              }))
        }
        onLinkIdentity={
          api.linkParticipantIdentity &&
          ((personId, request) =>
            api.linkParticipantIdentity?.(organizationAlias, personId, request).then(() => {
              setRows((current) =>
                current.map((row) =>
                  row.personId === personId ? { ...row, hasIdentityLink: true } : row,
                ),
              );
            }))
        }
        onUnlinkIdentity={
          api.unlinkParticipantIdentity &&
          ((personId) =>
            api.unlinkParticipantIdentity?.(organizationAlias, personId).then(() => {
              setRows((current) =>
                current.map((row) =>
                  row.personId === personId ? { ...row, hasIdentityLink: false } : row,
                ),
              );
            }))
        }
        onEditTeamMembers={
          api.editTeamMemberships &&
          ((entrantId, members) =>
            api
              .editTeamMemberships?.(organizationAlias, tournamentAlias, entrantId, { members })
              .then((updated) => {
                setRows((current) =>
                  current.map((row) =>
                    row.entrantId === entrantId
                      ? {
                          ...row,
                          teamMembers:
                            updated.teamMembers?.map((m) => m.displayName || m.personId) ?? [],
                          teamMembersDetailed: updated.teamMembers,
                        }
                      : row,
                  ),
                );
              }))
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
  // The API now supplies a person entrant's real displayName; a team
  // entrant still has none to show, so this placeholder stays the fallback.
  const displayName = row.displayName ?? row.teamId ?? row.personId ?? row.entrantId;
  return {
    entrantId: row.entrantId,
    displayName,
    status: row.status,
    submittedAt: '',
    contactEmail: contactUnavailableLabel,
    ...(row.personId === undefined ? {} : { personId: row.personId }),
    ...(row.teamId === undefined ? {} : { teamId: row.teamId }),
    ...(row.nationality === undefined ? {} : { nationality: row.nationality }),
    ...(row.photoObjectId === undefined ? {} : { photoObjectId: row.photoObjectId }),
    ...(row.hasIdentityLink === undefined ? {} : { hasIdentityLink: row.hasIdentityLink }),
    teamMembers: row.teamMembers?.map((m) => m.displayName || m.personId) ?? [],
    teamMembersDetailed: row.teamMembers,
    experience: experienceUnrecordedLabel,
    requiresCheckIn: false,
  };
}
