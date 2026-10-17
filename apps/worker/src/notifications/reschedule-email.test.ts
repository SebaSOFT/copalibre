import { SUPPORTED_LANGUAGES } from '@copalibre/domain';
import {
  RESCHEDULE_ROW_CAP,
  changesOf,
  rescheduleEmailContent,
  rescheduleRecipients,
  type RescheduleAssignment,
  type RescheduledMatch,
  type ScheduleChange,
} from './reschedule-email.js';

const T1 = 'tournament-1';
const kickoff = Date.UTC(2026, 10, 14, 17, 30);
const later = Date.UTC(2026, 10, 14, 21);
const court = { alias: 'cancha-1', name: 'Cancha 1' };

function change(
  matchId: string,
  reason: ScheduleChange['reason'] = { text: 'Cancha 1 sin luz' },
  overrides: Partial<ScheduleChange> = {},
): ScheduleChange {
  return {
    matchId,
    tournamentId: T1,
    previous: { startsAt: kickoff, venue: court },
    next: { startsAt: later, venue: court },
    withdrawn: false,
    reason,
    ...overrides,
  };
}

const matches = new Map<string, RescheduledMatch>([
  [
    'ab',
    {
      label: 'Andes vs Bravo',
      tournament: { alias: 'apertura', name: 'Apertura' },
      clubIds: ['club-a', 'club-b'],
    },
  ],
  [
    'ac',
    {
      label: 'Andes vs Cóndor',
      tournament: { alias: 'apertura', name: 'Apertura' },
      clubIds: ['club-a', 'club-c'],
    },
  ],
  [
    'solo',
    {
      label: 'Pérez vs A definir',
      tournament: { alias: 'apertura', name: 'Apertura' },
      clubIds: [],
    },
  ],
]);

const assignment = (
  email: string,
  role: string,
  scope: { clubId?: string; tournamentId?: string } = {},
  principalId = email,
): RescheduleAssignment => ({
  email,
  principalId,
  role,
  clubId: scope.clubId ?? null,
  tournamentId: scope.tournamentId ?? null,
});

describe('rescheduleRecipients', () => {
  const assignments = [
    assignment('a@club.test', 'club-admin', { clubId: 'club-a' }),
    assignment('b@club.test', 'club-admin', { clubId: 'club-b' }),
    assignment('c@club.test', 'club-admin', { clubId: 'club-c' }),
    assignment('torneo@liga.test', 'tournament-admin', { tournamentId: T1 }),
    assignment('otro@liga.test', 'tournament-admin', { tournamentId: 'tournament-2' }),
  ];

  it('tells both clubs of a moved match and its tournament admins, nobody else', () => {
    const recipients = rescheduleRecipients([change('ab')], matches, assignments, 'user:organizer');
    expect([...recipients.keys()]).toEqual(['a@club.test', 'b@club.test', 'torneo@liga.test']);
  });

  it('gives each recipient one list for the whole batch', () => {
    const recipients = rescheduleRecipients(
      [change('ab'), change('ac')],
      matches,
      assignments,
      undefined,
    );
    expect(recipients.get('a@club.test')?.map((entry) => entry.matchId)).toEqual(['ab', 'ac']);
    expect(recipients.get('c@club.test')?.map((entry) => entry.matchId)).toEqual(['ac']);
    expect(recipients.get('torneo@liga.test')).toHaveLength(2);
  });

  it('leaves out the actor, even through another assignment', () => {
    const actorAssignments = [
      ...assignments,
      assignment('ana@liga.test', 'club-admin', { clubId: 'club-a' }, 'principal-ana'),
      assignment('ana@liga.test', 'tournament-admin', { tournamentId: T1 }, 'principal-ana'),
    ];
    const recipients = rescheduleRecipients(
      [change('ab')],
      matches,
      actorAssignments,
      'user:principal-ana',
    );
    expect(recipients.has('ana@liga.test')).toBe(false);
  });

  it('collapses one address held through several assignments, case-insensitively', () => {
    const recipients = rescheduleRecipients(
      [change('ab')],
      matches,
      [
        assignment('Admin@Club.test', 'club-admin', { clubId: 'club-a' }),
        assignment('admin@club.test', 'tournament-admin', { tournamentId: T1 }),
      ],
      undefined,
    );
    expect([...recipients.keys()]).toEqual(['Admin@Club.test']);
    expect(recipients.get('Admin@Club.test')).toHaveLength(1);
  });

  it('reaches no club for an individual without one or an undecided side', () => {
    const recipients = rescheduleRecipients([change('solo')], matches, assignments, undefined);
    expect([...recipients.keys()]).toEqual(['torneo@liga.test']);
  });
});

describe('rescheduleEmailContent', () => {
  const content = (
    changes: readonly ScheduleChange[],
    language: (typeof SUPPORTED_LANGUAGES)[number] = 'es',
  ) =>
    rescheduleEmailContent({
      language,
      timeZone: 'America/Argentina/Mendoza',
      changes,
      matches,
      programmeUrl: 'https://copa.test/es/liga/tournaments/apertura/matches',
    });

  it('names each match, its old and new time and venue, under its reason', () => {
    const email = content([
      change('ab', { code: 'venue-unavailable', text: 'Cancha no disponible' }),
    ]);
    expect(email.subject).toBe('Cambió el horario: Apertura');
    expect(email.paragraphs[0]).toBe('Cambió uno de tus partidos.');
    expect(email.paragraphs[1]).toBe('Motivo: Cancha no disponible');
    // 17:30 UTC is 14:30 in Mendoza, 21:00 UTC is 18:00.
    expect(email.paragraphs[2]).toMatch(
      /^Andes vs Bravo: .*14:30.* en Cancha 1 → .*18:00.* en Cancha 1$/,
    );
    expect(email.action?.url).toContain('/tournaments/apertura/matches');
  });

  it('groups exceptions under their own reason', () => {
    const email = content([
      change('ab', { text: 'Cancha 1 sin luz' }),
      change('ac', { text: 'Pedido del club visitante' }),
      change('solo', { text: 'Cancha 1 sin luz' }),
    ]);
    expect(email.paragraphs).toEqual([
      'Cambiaron 3 de tus partidos.',
      'Motivo: Cancha 1 sin luz',
      expect.stringMatching(/^Andes vs Bravo:/),
      expect.stringMatching(/^Pérez vs A definir:/),
      'Motivo: Pedido del club visitante',
      expect.stringMatching(/^Andes vs Cóndor:/),
    ]);
  });

  it('words a preset reason in the email language, and lists a withdrawal', () => {
    const email = content(
      [change('ab', { code: 'weather', text: 'Weather' }, { next: null, withdrawn: true })],
      'de',
    );
    expect(email.paragraphs[1]).toBe('Grund: Wetter');
    expect(email.paragraphs[2]).toMatch(/^Andes vs Bravo: .*, aus dem Spielplan genommen$/);
  });

  it('caps the rows and points at the programme for the rest', () => {
    const many = Array.from({ length: RESCHEDULE_ROW_CAP + 7 }, () => change('ab'));
    const email = content(many, 'en');
    expect(email.paragraphs.filter((line) => line.startsWith('Andes vs Bravo'))).toHaveLength(
      RESCHEDULE_ROW_CAP,
    );
    expect(email.paragraphs.at(-1)).toBe('…and 7 more in the programme.');
  });

  it.each(SUPPORTED_LANGUAGES)('renders every line without placeholders in %s', (language) => {
    const email = content(
      [
        change('ab', { code: 'broadcast', text: '' }),
        change('ac', { text: '' }, { next: null, withdrawn: true }),
      ],
      language,
    );
    for (const line of [
      email.subject,
      email.heading,
      ...email.paragraphs,
      email.action?.label ?? '',
    ]) {
      expect(line.length).toBeGreaterThan(0);
      expect(line).not.toMatch(/undefined|\$\{|\{[a-z]+\}/);
    }
  });
});

describe('changesOf', () => {
  it('keeps well-formed changes and reads an older payload without them as none', () => {
    const valid = {
      matchId: 'ab',
      tournamentId: T1,
      previous: { startsAt: kickoff, venue: null },
      next: null,
      withdrawn: true,
      reason: { text: '' },
    };
    expect(changesOf(undefined)).toEqual([]);
    expect(changesOf([valid, { matchId: 'x' }, null, 'nope'])).toEqual([valid]);
  });
});
