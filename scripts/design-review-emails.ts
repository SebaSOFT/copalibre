import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@copalibre/domain';
import {
  invitationMessage,
  passwordResetMessage,
  type EmailDeliveryConfig,
} from '../apps/worker/src/invitations/email-delivery.js';
import { emailCopy } from '../apps/worker/src/notifications/email-copy.js';
import { renderEmail, type EmailContent } from '../apps/worker/src/notifications/email-layout.js';
import {
  rescheduleEmailContent,
  type ScheduleChange,
} from '../apps/worker/src/notifications/reschedule-email.js';

/**
 * Renders each transactional email through the worker's own builders, with fixture payloads, for
 * the design review. Long names stand in for real ones, because length is what breaks an email.
 */

export interface ReviewEmail {
  readonly template: string;
  readonly language: SupportedLanguage;
  readonly subject: string;
  readonly html: string;
}

const APP_URL = 'https://demo.copalibre.test';
const CONFIG = { appUrl: APP_URL } as EmailDeliveryConfig;
const TO = 'operator@copalibre.test';
const ORGANIZATION = {
  alias: 'confederacion-panamericana',
  name: 'Confederación Panamericana de Clubes',
  hasEmblem: true,
};
const TOURNAMENT = 'Copa Panamericana de Clubes 2025';
const ENTRANT = 'Club Atlético Independiente de Avellaneda';
const CLUB = 'Sociedad Deportiva Unión Fraternal';
const EXPIRES_AT = Date.UTC(2026, 10, 11, 18, 30);
const CONTROL_URL = `${APP_URL}/control/${ORGANIZATION.alias}`;

const SLOT = (day: number, hour: number) => ({
  startsAt: Date.UTC(2026, 10, day, hour),
  venue: { alias: 'estadio-norte', name: 'Estadio Norte' },
});

const CHANGES: readonly ScheduleChange[] = [
  {
    matchId: 'moved',
    tournamentId: 'cup',
    previous: SLOT(7, 18),
    next: SLOT(8, 20),
    withdrawn: false,
    reason: { code: 'weather', text: '' },
  },
  {
    matchId: 'withdrawn',
    tournamentId: 'cup',
    previous: SLOT(7, 20),
    next: null,
    withdrawn: true,
    reason: { text: 'La cancha no estará disponible por obras de drenaje.' },
  },
];

const MATCHES = new Map(
  CHANGES.map((change) => [
    change.matchId,
    {
      label: `${ENTRANT} – ${CLUB}`,
      tournament: { alias: 'copa', name: TOURNAMENT },
      clubIds: [],
    },
  ]),
);

type Content = Pick<EmailContent, 'subject' | 'heading' | 'paragraphs' | 'action'>;

function lifecycleContents(language: SupportedLanguage): Readonly<Record<string, Content>> {
  const copy = emailCopy(language);
  return {
    'tournament-created': {
      subject: copy.tournamentCreated.subject(TOURNAMENT),
      heading: copy.tournamentCreated.heading,
      paragraphs: [copy.tournamentCreated.body(TOURNAMENT)],
      action: { label: copy.tournamentCreated.action, url: `${CONTROL_URL}/tournaments/copa` },
    },
    'club-created': {
      subject: copy.clubCreated.subject(CLUB),
      heading: copy.clubCreated.heading,
      paragraphs: [copy.clubCreated.body(CLUB)],
      action: { label: copy.clubCreated.action, url: `${CONTROL_URL}/clubs` },
    },
    'entrant-registered': {
      subject: copy.entrantRegistered.subject(ENTRANT, TOURNAMENT),
      heading: copy.entrantRegistered.heading,
      paragraphs: [copy.entrantRegistered.body(ENTRANT, TOURNAMENT)],
      action: { label: copy.entrantRegistered.action, url: `${CONTROL_URL}/tournaments/copa` },
    },
    'squad-submitted': {
      subject: copy.squadSubmitted.subject(ENTRANT, TOURNAMENT),
      heading: copy.squadSubmitted.heading,
      paragraphs: [copy.squadSubmitted.body(ENTRANT, TOURNAMENT), copy.squadSubmitted.members(23)],
      action: { label: copy.squadSubmitted.action, url: `${CONTROL_URL}/tournaments/copa` },
    },
    reschedule: rescheduleEmailContent({
      language,
      timeZone: 'America/Argentina/Buenos_Aires',
      changes: CHANGES,
      matches: MATCHES,
      programmeUrl: `${APP_URL}/${language}/${ORGANIZATION.alias}/tournaments/copa/matches`,
    }),
  };
}

function emailsIn(language: SupportedLanguage): readonly ReviewEmail[] {
  const lifecycle = Object.entries(lifecycleContents(language)).map(([template, content]) => ({
    template,
    message: renderEmail(CONFIG, { ...content, to: TO, language, organization: ORGANIZATION }),
  }));
  const invitation = invitationMessage(
    CONFIG,
    { recipientEmail: TO, token: 'fixture', expiresAt: EXPIRES_AT } as Parameters<
      typeof invitationMessage
    >[1],
    { language, organization: ORGANIZATION },
  );
  return [...lifecycle, { template: 'invitation', message: invitation }].map(
    ({ template, message }) => ({
      template,
      language,
      subject: message.subject,
      html: message.html,
    }),
  );
}

export function renderReviewEmails(): readonly ReviewEmail[] {
  // A reset is principal-scoped: it has no organization language, so it exists in English only.
  const reset = passwordResetMessage(CONFIG, {
    recipientEmail: TO,
    token: 'fixture',
    expiresAt: EXPIRES_AT,
  } as Parameters<typeof passwordResetMessage>[1]);
  return [
    ...SUPPORTED_LANGUAGES.flatMap(emailsIn),
    { template: 'password-reset', language: 'en', subject: reset.subject, html: reset.html },
  ];
}
