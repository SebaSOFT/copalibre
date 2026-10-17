import type { SupportedLanguage } from '@copalibre/domain';
import type { Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { EmailDeliveryConfig } from '../invitations/email-delivery.js';
import type { JobHandler } from '../jobs/dispatcher.js';
import { payloadOf } from '../jobs/relay-runner.js';
import { deliverOnce, type EmailHandlerDependencies } from './delivery.js';
import { emailCopy } from './email-copy.js';
import { renderEmail } from './email-layout.js';
import { loadOrganizationBranding } from './organization.js';
import {
  changesOf,
  rescheduleEmailContent,
  rescheduleRecipients,
  type RescheduledMatch,
  type ScheduleChange,
} from './reschedule-email.js';

/** The organization-level summary a published batch emits. */
export const RESCHEDULE_EMAIL_EVENT = 'schedule.published';

/**
 * Emails the clubs and tournament admins a published batch's changes concern: one email per
 * recipient per batch, through the same `(event, recipient)` reservation as every other email. First
 * placements are not changes, and a batch from an import or demo loading tells nobody.
 */
export function rescheduleEmailHandler(
  config: EmailDeliveryConfig,
  dependencies: EmailHandlerDependencies,
): JobHandler {
  const { db } = dependencies;
  return async (job) => {
    const payload = payloadOf<{ origin?: unknown; actor?: unknown; changes?: unknown }>(job);
    if (payload.origin === 'import') return;
    const changes = changesOf(payload.changes);
    if (changes.length === 0) return;

    const branding = await loadOrganizationBranding(db, job.organizationId);
    if (!branding?.organization) return;
    const { organization, language } = branding;
    const zone = await db
      .selectFrom('organizations')
      .select('timezone')
      .where('organization_id', '=', job.organizationId)
      .executeTakeFirst();
    const matches = await rescheduledMatches(db, changes, emailCopy(language).reschedule.undecided);
    const assignments = await db
      .selectFrom('organization_role_assignments')
      .select(['email', 'principal_id', 'role', 'club_id', 'tournament_id'])
      .where('organization_id', '=', job.organizationId)
      .where('status', '=', 'active')
      .where('deleted_at', 'is', null)
      .where('role', 'in', ['club-admin', 'tournament-admin'])
      .execute();
    const recipients = rescheduleRecipients(
      changes,
      matches,
      assignments.map((row) => ({
        email: row.email,
        principalId: row.principal_id,
        role: row.role,
        clubId: row.club_id,
        tournamentId: row.tournament_id,
      })),
      payload.actor,
    );

    for (const [address, own] of recipients) {
      const tournamentAliases = new Set(
        own.map((change) => matches.get(change.matchId)?.tournament.alias),
      );
      const [alias] = tournamentAliases;
      const message = renderEmail(config, {
        ...rescheduleEmailContent({
          language,
          timeZone: zone?.timezone ?? 'UTC',
          changes: own,
          matches,
          programmeUrl: publicUrl(
            config,
            language,
            tournamentAliases.size === 1 && alias !== undefined
              ? `${encodeURIComponent(organization.alias)}/tournaments/${encodeURIComponent(alias)}/matches`
              : encodeURIComponent(organization.alias),
          ),
        }),
        to: address,
        language,
        organization,
      });
      await deliverOnce(dependencies, config, job.eventId, message, { eventType: job.eventType });
    }
  };
}

/** Each changed match's label, tournament and clubs, read now rather than when it was published. */
async function rescheduledMatches(
  db: Kysely<Database>,
  changes: readonly ScheduleChange[],
  undecided: string,
): Promise<ReadonlyMap<string, RescheduledMatch>> {
  const rows = await db
    .selectFrom('matches')
    .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
    .innerJoin('stages', 'stages.stage_id', 'fixtures.stage_id')
    .innerJoin('seasons', 'seasons.season_id', 'stages.season_id')
    .innerJoin('tournaments', 'tournaments.tournament_id', 'seasons.tournament_id')
    .select([
      'matches.match_id',
      'fixtures.home_entrant_id',
      'fixtures.away_entrant_id',
      'tournaments.alias',
      'tournaments.name',
    ])
    .where(
      'matches.match_id',
      'in',
      changes.map((change) => change.matchId),
    )
    .execute();
  const entrantIds = [
    ...new Set(
      rows.flatMap((row) =>
        [row.home_entrant_id, row.away_entrant_id].filter((id): id is string => id !== null),
      ),
    ),
  ];
  const entrants =
    entrantIds.length === 0
      ? []
      : await db
          .selectFrom('entrants')
          .leftJoin('teams', 'teams.team_id', 'entrants.team_id')
          .leftJoin('persons', 'persons.person_id', 'entrants.person_id')
          .select([
            'entrants.entrant_id',
            'teams.name as team_name',
            'teams.club_id as team_club_id',
            'persons.display_name',
            'persons.club_id as person_club_id',
          ])
          .where('entrants.entrant_id', 'in', entrantIds)
          .execute();
  const entrantOf = (entrantId: string | null) =>
    entrantId === null ? undefined : entrants.find((entrant) => entrant.entrant_id === entrantId);
  return new Map(
    rows.map((row) => {
      const sides = [entrantOf(row.home_entrant_id), entrantOf(row.away_entrant_id)];
      return [
        row.match_id,
        {
          label: sides
            .map((side) => side?.team_name ?? side?.display_name ?? undecided)
            .join(' vs '),
          tournament: { alias: row.alias, name: row.name },
          clubIds: sides.flatMap((side) => {
            const clubId = side?.team_club_id ?? side?.person_club_id;
            return clubId === null || clubId === undefined ? [] : [clubId];
          }),
        },
      ];
    }),
  );
}

/** A public page in the email's language: English unprefixed, as the public site routes it. */
function publicUrl(config: EmailDeliveryConfig, language: SupportedLanguage, path: string): string {
  const prefix = language === 'en' ? '' : `/${language}`;
  return new URL(`${prefix}/${path}`, config.appUrl).toString();
}
