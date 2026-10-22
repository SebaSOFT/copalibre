import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import {
  createControlApiClient,
  type ControlApiClient,
  type CsvImportPreviewResponse,
  type RegistrationResponse,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import {
  RegistrationReviewTemplate,
  type ReviewRegistrationRow,
} from '../screens/RegistrationReviewTemplate.js';
import type { AlertTone } from '../ui/atoms/alert.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { useResilientRead } from './use-resilient-read.js';

export function RegistrationReviewPage({
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

  const [csv, setCsv] = useState<CsvImportPreviewResponse>();
  const [csvStatus, setCsvStatus] = useState<{
    readonly text: string;
    readonly tone: AlertTone;
  }>();
  const read = useResilientRead(
    `control-registrations:${organizationAlias}:${tournamentAlias}:${intl.locale}`,
    async () => {
      const [registrations, abbreviationCandidates] = await Promise.all([
        api.listRegistrations(organizationAlias, tournamentAlias),
        api.listEntrantsNeedingAbbreviation?.(organizationAlias, tournamentAlias) ??
          Promise.resolve([]),
      ]);
      const rows: readonly ReviewRegistrationRow[] = registrations.map((row) =>
        toReviewRow(
          row,
          intl.formatMessage(messages.registrationContactUnavailable),
          intl.formatMessage(messages.registrationExperienceUnrecorded),
        ),
      );
      return { rows, abbreviationCandidates };
    },
    {
      thing: intl.formatMessage(messages.reviewTitle),
      isEmpty: (data) => data.rows.length === 0 && data.abbreviationCandidates.length === 0,
    },
  );
  const { rows = [], abbreviationCandidates = [] } = read.data ?? {};
  const setRows = (
    change: (rows: readonly ReviewRegistrationRow[]) => readonly ReviewRegistrationRow[],
  ): void => read.update((current) => ({ ...current, rows: change(current.rows) }));
  const setAbbreviationCandidates = (
    change: (rows: readonly RegistrationResponse[]) => readonly RegistrationResponse[],
  ): void =>
    read.update((current) => ({
      ...current,
      abbreviationCandidates: change(current.abbreviationCandidates),
    }));

  return (
    <ReadState {...read} title={intl.formatMessage(messages.reviewTitle)}>
      <RegistrationReviewTemplate
        abbreviationCandidates={abbreviationCandidates.map((row) => ({
          entrantId: row.entrantId,
          displayName: row.displayName ?? row.teamId ?? row.personId ?? row.entrantId,
        }))}
        csv={csv}
        csvStatus={csvStatus}
        loadStatus="ready"
        organizationAlias={organizationAlias}
        tournamentName={tournamentAlias}
        rows={rows}
        now={now}
        onCsvFileSelected={(file) => {
          void file.text().then((sourceCsv) =>
            csvApi
              .createCsvImport(organizationAlias, tournamentAlias, {
                target: 'team',
                sourceCsv,
              })
              .then((created) => {
                setCsv(created);
                setCsvStatus({
                  text: intl.formatMessage(messages.registrationImportQueued),
                  tone: 'info',
                });
                return csvApi.fetchCsvImport(organizationAlias, tournamentAlias, created.importId);
              })
              .then((preview) => {
                setCsv(preview);
                setCsvStatus({ text: preview.status, tone: 'info' });
              })
              .catch(() =>
                setCsvStatus({
                  text: intl.formatMessage(messages.registrationImportCreateFailed),
                  tone: 'destructive',
                }),
              ),
          );
        }}
        onConfirmCsvImport={() => {
          if (!csv) return;
          void csvApi
            .commitCsvImport(organizationAlias, tournamentAlias, csv.importId, csv.sourceHash)
            .then((next) => {
              setCsv(next);
              setCsvStatus({
                text: intl.formatMessage(messages.registrationImportConfirmed),
                tone: 'success',
              });
            });
        }}
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
    </ReadState>
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
