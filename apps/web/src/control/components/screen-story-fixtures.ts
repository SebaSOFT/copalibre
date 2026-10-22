import type {
  AuditRecordResponse,
  TableProjectionResponseData,
  MatchConsoleResponse,
  RegistrationResponse,
} from '../lib/api-client.js';
import type { ReviewRegistrationRow } from './screens/RegistrationReviewTemplate.js';
import { createIntl } from 'react-intl';
import { isSupportedLanguage } from '@copalibre/domain';
import { CATALOGS } from '../i18n/ControlIntl.js';
import {
  Fragment,
  createElement,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { clearResilientReadCache } from './pages/use-resilient-read.js';

/** A selected story starts a session; its own remounts still share read data. */
export function ReadStoryScope({ children }: { readonly children: ReactNode }): ReactElement {
  useState(() => {
    clearResilientReadCache();
    return true;
  });
  return createElement(Fragment, null, children);
}

/** Load the real page, then reopen it with its own failing narrow client. */
export function StaleReadStory({
  loaded,
  failed,
}: {
  readonly loaded: ReactNode;
  readonly failed: ReactNode;
}): ReactElement {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setOffline(true), 350);
    return () => clearTimeout(timer);
  }, []);
  return createElement(Fragment, { key: offline ? 'failed' : 'loaded' }, offline ? failed : loaded);
}
import type { CanvasMatch } from '../lib/bracket-canvas.js';
import type { DisciplineOption } from '../lib/wizard.js';
import type { MatchCardData } from '../../lib/matches-view.js';
import type {
  QualificationPreviewResponse,
  QualifierSeedResponse,
  TournamentResponse,
} from '../lib/api-client.js';

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
  fourth: '019927d0-0000-7000-8000-000000000009',
  matchTwo: '019927d0-0000-7000-8000-00000000000a',
  matchThree: '019927d0-0000-7000-8000-00000000000b',
} as const;
export const names = {
  [ids.first]: 'Meridian Seven',
  [ids.second]: 'Ironclad Five',
  [ids.third]: 'Echo Squadron',
  [ids.fourth]: 'Vanguard Nine',
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

/**
 * A 4-entrant single-elimination canvas mixing a fully-linked round (both
 * round-one matches materialized as real fixtures) with a still-pending
 * final — every node a persisted match links, a node with none doesn't.
 */
export const mixedBracket: readonly CanvasMatch[] = [
  {
    matchId: 'SE-R1-M1',
    persistedMatchId: ids.match,
    bracket: 'winners',
    round: 1,
    position: 1,
    status: 'scheduled',
    slots: [
      { kind: 'entrant', entrantId: names[ids.first] },
      { kind: 'entrant', entrantId: names[ids.second] },
    ],
  },
  {
    matchId: 'SE-R1-M2',
    persistedMatchId: ids.matchTwo,
    bracket: 'winners',
    round: 1,
    position: 2,
    status: 'scheduled',
    slots: [
      { kind: 'entrant', entrantId: names[ids.third] },
      { kind: 'entrant', entrantId: names[ids.fourth] },
    ],
  },
  {
    matchId: 'SE-R2-M1',
    bracket: 'winners',
    round: 2,
    position: 1,
    status: 'scheduled',
    slots: [
      { kind: 'winner-of', matchId: 'SE-R1-M1' },
      { kind: 'winner-of', matchId: 'SE-R1-M2' },
    ],
  },
];

/** Every round-one node linkable, none pending — the fully-linked-round story. */
export const fullyLinkedBracket: readonly CanvasMatch[] = mixedBracket.filter(
  (match) => match.round === 1,
);

/**
 * `mixedBracket` with its round-two final also materialized — every node has a
 * `persistedMatchId`, so both an early and a late match can be the console's focus target.
 */
export const focusableBracket: readonly CanvasMatch[] = mixedBracket.map((match) =>
  match.matchId === 'SE-R2-M1' ? { ...match, persistedMatchId: ids.matchThree } : match,
);

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
  stageNumber: 1,
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

const PLAN = '019927d0-0000-7000-8000-0000000000c1';

/** Two groups feeding a four-team cup: positions 1–4 are 1st A, 2nd A, 1st B, 2nd B. */
export const qualifierSeeds: readonly QualifierSeedResponse[] = [
  [1, 1, 'Grupo A'],
  [2, 2, 'Grupo A'],
  [3, 1, 'Grupo B'],
  [4, 2, 'Grupo B'],
].map(([position, rank, groupName]) => ({
  promotionPlanId: PLAN,
  position: position as number,
  qualifierLabel: {
    kind: 'group-rank' as const,
    rank: rank as number,
    groupNumber: groupName === 'Grupo A' ? 1 : 2,
    groupName: groupName as string,
  },
}));

const qualificationNames = {
  [ids.first]: 'Club Atlético San Martín',
  [ids.second]: 'Deportivo Cuyo',
  [ids.third]: 'Sportivo Desamparados',
  [ids.fourth]: 'Unión Rawson',
};

/** A qualification preview in each state the confirmation screen distinguishes. */
export function qualificationPreview(
  state: QualificationPreviewResponse['state'],
): QualificationPreviewResponse {
  const entrants = [ids.first, ids.second, ids.third, ids.fourth];
  const settled = state !== 'incomplete';
  return {
    state,
    positions: qualifierSeeds.map((seed, index) => ({
      ...seed,
      ...(settled && !(state === 'tied' && index === 3)
        ? { entrantId: state === 'stale' && index < 2 ? entrants[1 - index] : entrants[index] }
        : {}),
      ...(state === 'confirmed' || state === 'stale'
        ? { confirmedEntrantId: entrants[index] }
        : {}),
    })),
    incomplete:
      state === 'incomplete'
        ? [
            {
              matchId: ids.match,
              round: 3,
              status: 'live',
              homeEntrantId: ids.first,
              awayEntrantId: ids.second,
            },
            {
              matchId: ids.matchTwo,
              round: 3,
              status: 'scheduled',
              homeEntrantId: ids.third,
              awayEntrantId: ids.fourth,
            },
          ]
        : [],
    ...(state === 'tied'
      ? {
          tie: {
            promotionPlanId: PLAN,
            entrantIds: [ids.fourth, ids.second],
            positions: [4],
            groupName: 'Grupo B',
          },
        }
      : {}),
    names: qualificationNames,
  };
}
