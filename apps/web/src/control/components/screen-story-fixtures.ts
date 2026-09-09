import type {
  AuditRecordResponse,
  TableProjectionResponseData,
  MatchConsoleResponse,
  RegistrationResponse,
} from '../lib/api-client.js';
import type { ReviewRegistrationRow } from './RegistrationReviewPage.js';
import { createIntl } from 'react-intl';
import { isSupportedLanguage } from '@copalibre/domain';
import { CATALOGS } from '../i18n/ControlIntl.js';
import type { CanvasMatch } from '../lib/bracket-canvas.js';
import type { DisciplineOption } from '../lib/wizard.js';
import type { MatchCardData } from '../../lib/matches-view.js';
import type { TournamentResponse } from '../lib/api-client.js';

/** Shared identities/data, never a shared API response registry. */
export function storyIntl(value: unknown) {
  const locale = typeof value === 'string' && isSupportedLanguage(value) ? value : 'en';
  return createIntl({ locale, defaultLocale: 'en', messages: CATALOGS[locale] });
}

export const ORG = 'liga-san-juan';
export const TOURNAMENT = 'copa-premier';
export const TITLE = 'Copa Premier';
export const NOW = '2026-09-08T19:00:00.000Z';
export const ids = {
  organization: '019927d0-0000-7000-8000-000000000001',
  tournament: '019927d0-0000-7000-8000-000000000002',
  stage: '019927d0-0000-7000-8000-000000000003',
  match: '019927d0-0000-7000-8000-000000000004',
  first: '019927d0-0000-7000-8000-000000000005',
  second: '019927d0-0000-7000-8000-000000000006',
  third: '019927d0-0000-7000-8000-000000000007',
  person: '019927d0-0000-7000-8000-000000000008',
} as const;
export const names = {
  [ids.first]: 'Meridian Seven',
  [ids.second]: 'Ironclad Five',
  [ids.third]: 'Echo Squadron',
};
export const tournament = {
  tournamentId: ids.tournament,
  organizationId: ids.organization,
  alias: TOURNAMENT,
  name: TITLE,
  status: 'started',
} satisfies TournamentResponse;
export const discipline: DisciplineOption = {
  descriptorId: ids.stage,
  alias: 'football',
  version: '1.0.0',
  name: {
    en: 'Football',
    es: 'Fútbol',
    de: 'Fußball',
    fr: 'Football',
    pt: 'Futebol',
    it: 'Calcio',
    ru: 'Футбол',
    zh: '足球',
  },
  supportedFormats: ['single-elimination', 'round-robin'],
};
export const liveMatch: MatchCardData = {
  matchId: ids.match,
  stageNumber: 1,
  matchNumber: 1,
  state: 'live',
  homeName: names[ids.first],
  awayName: names[ids.second],
  homeScore: 3,
  awayScore: 1,
  clockSeconds: 5001,
};
export const auditRecords = [
  {
    auditId: ids.match,
    organizationId: ids.organization,
    actor: 'table-referee',
    entityType: 'match',
    entityId: ids.match,
    authorizationContext: 'org.record-match-events',
    action: 'match.score.recorded',
    outcome: 'applied',
    occurredAt: NOW,
  },
] satisfies readonly AuditRecordResponse[];
export const projection: TableProjectionResponseData = {
  layoutCode: 'group-standings-default',
  target: 'group-phase',
  label: {
    en: 'Standings',
    es: 'Posiciones',
    de: 'Tabelle',
    fr: 'Classement',
    pt: 'Classificação',
    it: 'Classifica',
    ru: 'Таблица',
    zh: '积分榜',
  },
  columns: [
    {
      code: 'entrant-name',
      header: {
        en: 'Team',
        es: 'Equipo',
        de: 'Mannschaft',
        fr: 'Équipe',
        pt: 'Equipe',
        it: 'Squadra',
        ru: 'Команда',
        zh: '队伍',
      },
      format: 'text',
    },
    {
      code: 'points',
      header: {
        en: 'Points',
        es: 'Puntos',
        de: 'Punkte',
        fr: 'Points',
        pt: 'Pontos',
        it: 'Punti',
        ru: 'Очки',
        zh: '积分',
      },
      format: 'number',
    },
  ],
  defaultSort: [{ columnCode: 'points', direction: 'desc' }],
  rows: [ids.first, ids.second, ids.third].map((id, index) => ({
    actorId: id,
    entrantId: id,
    rank: index + 1,
    sharedRank: false,
    cells: {
      'entrant-name': { raw: names[id], formatted: names[id] },
      points: { raw: 6 - index * 3, formatted: String(6 - index * 3) },
    },
  })),
  projectionVersion: 7,
};
export const bracket: readonly CanvasMatch[] = [
  {
    matchId: ids.match,
    bracket: 'winners',
    round: 1,
    position: 1,
    status: 'scheduled',
    slots: [
      { kind: 'entrant', entrantId: ids.first },
      { kind: 'entrant', entrantId: ids.second },
    ],
  },
];

export const registrations: readonly RegistrationResponse[] = [
  ids.first,
  ids.second,
  ids.third,
].map((entrantId, index) => ({
  personId: entrantId,
  tournamentId: ids.tournament,
  entrantId,
  displayName: ['V. Kael', 'L. Vega', 'A. Silva'][index],
  status: index === 0 ? 'pending' : 'accepted',
}));
export const reviewRows: readonly ReviewRegistrationRow[] = registrations.map((row) => ({
  entrantId: row.entrantId,
  displayName: row.displayName ?? row.entrantId,
  status: row.status,
  submittedAt: NOW,
  contactEmail: 'captain@example.invalid',
  teamMembers: ['V. Kael'],
  experience: '2025 / Copa Premier',
  requiresCheckIn: true,
  checkInClosesAt: '2026-09-08T18:00:00.000Z',
}));

/** A paused, in-progress match: time never drifts while comparing viewports. */
export const consoleProjection: MatchConsoleResponse = {
  matchId: ids.match,
  status: 'in-progress',
  result: null,
  projectionVersion: 7,
  liveScores: [
    { entrantId: ids.first, score: 3, statistics: {} },
    { entrantId: ids.second, score: 1, statistics: {} },
  ],
  segments: [
    {
      segmentId: ids.stage,
      number: 2,
      type: 'half',
      state: 'active',
      elapsedSeconds: 2301,
      durationSeconds: 2700,
    },
  ],
  runningTimers: [],
  events: [
    {
      eventId: ids.third,
      sequence: 1,
      definitionCode: 'goal',
      occurredAt: NOW,
      segmentId: ids.stage,
      segmentElapsedSeconds: 1740,
      side: ids.first,
      personId: ids.person,
    },
  ],
  eventDefinitions: [
    {
      code: 'goal',
      label: {
        en: 'Goal',
        es: 'Gol',
        de: 'Tor',
        fr: 'But',
        pt: 'Gol',
        it: 'Gol',
        ru: 'Гол',
        zh: '进球',
      },
      category: 'positive',
      permittedSegmentTypes: ['half'],
      actorRequirement: 'person',
      payloadSchema: {},
      display: {},
      secondaryActorFields: [],
    },
  ],
  eligiblePersonIds: [ids.person],
  eligibleStaffIds: [],
  rosterRoles: [],
  rosters: [
    {
      entrantId: ids.first,
      teamName: names[ids.first],
      members: [{ personId: ids.person, name: 'V. Kael', number: 10, onField: true, roles: [] }],
    },
  ],
  entrants: [
    { entrantId: ids.first, name: names[ids.first] },
    { entrantId: ids.second, name: names[ids.second] },
  ],
  capabilities: [
    'match.control-clock',
    'match.record-event',
    'match.finalize',
    'match.select-roster',
  ],
};

/** A missing method is an error, never a quietly successful empty fixture. */
export function storyClient<T extends object>(methods: Partial<T>): T {
  return new Proxy(methods as T, {
    get(target, key, receiver) {
      if (typeof key === 'symbol' || key in target || key === 'then' || key === 'toJSON') {
        return Reflect.get(target, key, receiver);
      }
      throw new Error(`Story has no fixture for ${String(key)}`);
    },
  });
}

export const pending = <T>(): Promise<T> => new Promise<T>(() => undefined);
