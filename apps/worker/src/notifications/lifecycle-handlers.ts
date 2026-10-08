import type { Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { EmailDeliveryConfig } from '../invitations/email-delivery.js';
import type { JobHandler } from '../jobs/dispatcher.js';
import { payloadOf } from '../jobs/relay-runner.js';
import { deliverOnce, type EmailHandlerDependencies } from './delivery.js';
import { emailCopy } from './email-copy.js';
import { renderEmail, type EmailContent } from './email-layout.js';
import { loadOrganizationBranding } from './organization.js';
import { resolveAudience } from './recipients.js';

/** The four lifecycle events that send email, by outbox `eventType`. */
export const LIFECYCLE_EMAIL_EVENTS = [
  'tournament.created',
  'club.created',
  'entrant.registered',
  'entrant.squad-submitted',
] as const;

export type LifecycleEmailEvent = (typeof LIFECYCLE_EMAIL_EVENTS)[number];

interface Origin {
  readonly origin?: unknown;
}

/**
 * Handlers for the lifecycle notification events, keyed by event type.
 *
 * Each one resolves the organization (name, emblem, language), the audience, and the subject-matter
 * names at send time, renders through the shared layout, and delivers to each recipient at most once.
 * An event with no organization, no subject-matter row or no recipient completes without sending:
 * there is nobody to tell or nothing left to tell them about.
 */
export function lifecycleEmailHandlers(
  config: EmailDeliveryConfig,
  dependencies: EmailHandlerDependencies,
): Readonly<Record<LifecycleEmailEvent, JobHandler>> {
  const { db } = dependencies;

  return {
    'tournament.created': async (job) => {
      const payload = payloadOf<{ tournamentId: string; actor?: unknown } & Origin>(job);
      if (payload.origin === 'import') return;
      const tournament = await tournamentOf(db, payload.tournamentId);
      if (!tournament) return;
      await notify(dependencies, config, job, {
        audience: { actor: payload.actor },
        content: (organization, language, to) => {
          const copy = emailCopy(language).tournamentCreated;
          return {
            to,
            subject: copy.subject(tournament.name),
            heading: copy.heading,
            paragraphs: [copy.body(tournament.name)],
            action: {
              label: copy.action,
              url: controlUrl(config, organization.alias, `tournaments/${tournament.alias}`),
            },
          };
        },
      });
    },

    'club.created': async (job) => {
      const payload = payloadOf<{ name: string; actor?: unknown } & Origin>(job);
      if (payload.origin === 'import') return;
      if (typeof payload.name !== 'string') throw new Error('club.created payload is invalid');
      await notify(dependencies, config, job, {
        audience: { actor: payload.actor },
        content: (organization, language, to) => {
          const copy = emailCopy(language).clubCreated;
          return {
            to,
            subject: copy.subject(payload.name),
            heading: copy.heading,
            paragraphs: [copy.body(payload.name)],
            action: { label: copy.action, url: controlUrl(config, organization.alias, 'clubs') },
          };
        },
      });
    },

    'entrant.registered': async (job) => {
      const payload = payloadOf<
        { entrantId: string; tournamentId: string; actor?: unknown } & Origin
      >(job);
      // A club submitting its own squad is announced by `entrant.squad-submitted` instead.
      if (payload.origin === 'import' || payload.origin === 'club-portal') return;
      const tournament = await tournamentOf(db, payload.tournamentId);
      const entrantName = await entrantNameOf(db, payload.entrantId);
      if (!tournament || entrantName === undefined) return;
      await notify(dependencies, config, job, {
        audience: { tournamentId: payload.tournamentId, actor: payload.actor },
        content: (organization, language, to) => {
          const copy = emailCopy(language).entrantRegistered;
          return {
            to,
            subject: copy.subject(entrantName, tournament.name),
            heading: copy.heading,
            paragraphs: [copy.body(entrantName, tournament.name)],
            action: {
              label: copy.action,
              url: controlUrl(
                config,
                organization.alias,
                `tournaments/${tournament.alias}/registrations`,
              ),
            },
          };
        },
      });
    },

    'entrant.squad-submitted': async (job) => {
      const payload = payloadOf<{
        teamId: string;
        tournamentId: string;
        memberCount: number;
        actor?: unknown;
      }>(job);
      const tournament = await tournamentOf(db, payload.tournamentId);
      const team = await db
        .selectFrom('teams')
        .select('name')
        .where('team_id', '=', payload.teamId)
        .executeTakeFirst();
      if (!tournament || !team) return;
      await notify(dependencies, config, job, {
        audience: { tournamentId: payload.tournamentId, actor: payload.actor },
        content: (organization, language, to) => {
          const copy = emailCopy(language).squadSubmitted;
          return {
            to,
            subject: copy.subject(team.name, tournament.name),
            heading: copy.heading,
            paragraphs: [copy.body(team.name, tournament.name), copy.members(payload.memberCount)],
            action: {
              label: copy.action,
              url: controlUrl(
                config,
                organization.alias,
                `tournaments/${tournament.alias}/registrations`,
              ),
            },
          };
        },
      });
    },
  };
}

async function notify(
  dependencies: EmailHandlerDependencies,
  config: EmailDeliveryConfig,
  job: { readonly eventId: string; readonly eventType: string; readonly organizationId: string },
  input: {
    readonly audience: { readonly tournamentId?: string; readonly actor?: unknown };
    readonly content: (
      organization: NonNullable<EmailContent['organization']>,
      language: EmailContent['language'],
      to: string,
    ) => Pick<EmailContent, 'to' | 'subject' | 'heading' | 'paragraphs' | 'action'>;
  },
): Promise<void> {
  const branding = await loadOrganizationBranding(dependencies.db, job.organizationId);
  if (!branding?.organization) return;
  const { organization, language } = branding;

  const audience = await resolveAudience(dependencies.db, {
    organizationId: job.organizationId,
    ...input.audience,
  });
  for (const address of audience) {
    const message = renderEmail(config, {
      ...input.content(organization, language, address),
      language,
      organization,
    });
    await deliverOnce(dependencies, config, job.eventId, message, { eventType: job.eventType });
  }
}

function controlUrl(config: EmailDeliveryConfig, organizationAlias: string, path: string): string {
  return new URL(
    `/control/${encodeURIComponent(organizationAlias)}/${path}`,
    config.appUrl,
  ).toString();
}

async function tournamentOf(
  db: Kysely<Database>,
  tournamentId: string,
): Promise<{ readonly alias: string; readonly name: string } | undefined> {
  return db
    .selectFrom('tournaments')
    .select(['alias', 'name'])
    .where('tournament_id', '=', tournamentId)
    .executeTakeFirst();
}

/** A team entrant's team name, or a person entrant's display name. */
async function entrantNameOf(db: Kysely<Database>, entrantId: string): Promise<string | undefined> {
  const entrant = await db
    .selectFrom('entrants')
    .select(['team_id', 'person_id'])
    .where('entrant_id', '=', entrantId)
    .executeTakeFirst();
  if (!entrant) return undefined;
  if (entrant.team_id !== null) {
    const team = await db
      .selectFrom('teams')
      .select('name')
      .where('team_id', '=', entrant.team_id)
      .executeTakeFirst();
    return team?.name;
  }
  if (entrant.person_id !== null) {
    const person = await db
      .selectFrom('persons')
      .select('display_name')
      .where('person_id', '=', entrant.person_id)
      .executeTakeFirst();
    return person?.display_name;
  }
  return undefined;
}
