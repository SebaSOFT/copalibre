/** Match report fixtures: rosters, officials and the report models. */

import { humanizeCode } from '../descriptor-label.ts';
import type { MatchReportModel, MatchReportTimelineGroup } from '../match-report.js';
import type {
  PublicMatchOfficialResponse,
  PublicMatchRosterMemberResponse,
} from '@copalibre/api/src/dto/public-tournament.dto.js';
import { REFERENCE_ENTRANTS } from './entrants.ts';

const REFERENCE_ROSTER_HOME: PublicMatchRosterMemberResponse[] = [
  {
    personId: '01936f4a-6001-7000-8000-000000000001',
    number: 1,
    name: 'Jordan Ashworth',
    roles: ['goalkeeper'],
    onField: true,
  },
  {
    personId: '01936f4a-6002-7000-8000-000000000002',
    number: 7,
    name: 'Priya Natarajan-Whitfield',
    roles: ['forward', 'captain'],
    onField: true,
  },
  {
    personId: '01936f4a-6003-7000-8000-000000000003',
    number: 12,
    name: 'Kwame Osei',
    onField: false,
  },
];

const REFERENCE_ROSTER_AWAY: PublicMatchRosterMemberResponse[] = [
  {
    personId: '01936f4a-6004-7000-8000-000000000004',
    number: 1,
    name: 'Elif Yildirim',
    roles: ['goalkeeper'],
    onField: true,
  },
  {
    personId: '01936f4a-6005-7000-8000-000000000005',
    number: 9,
    name: 'Mateus Albuquerque',
    roles: ['forward'],
    onField: true,
  },
];

const REFERENCE_OFFICIALS: PublicMatchOfficialResponse[] = [
  { name: 'Sam Delacroix-Whitmore', roles: ['referee'] },
  { name: 'Noor Al-Rashid', roles: ['assistant-referee', 'var'] },
];

/** Reference roles carry no descriptor, so each reads as its humanized code. */
function withReferenceRoleLabels(member: PublicMatchRosterMemberResponse) {
  return { ...member, roleLabels: (member.roles ?? []).map(humanizeCode) };
}

/** A finished match whose timeline carries segment markers, game time and the running score. */
export function referenceTimedMatchReportModel(): MatchReportModel {
  const base = referenceMatchReportModel();
  const goal = (
    eventId: string,
    side: 'home' | 'away',
    elapsedSeconds: number,
    scoreAfter: readonly [number, number],
  ) => ({
    eventId,
    label: 'Goal',
    occurredAt: '2026-09-01T18:22:00.000Z',
    segmentNumber: 1,
    segmentLabel: 'Half',
    elapsedSeconds,
    side,
    scoreAfter,
  });
  const timeline: MatchReportTimelineGroup[] = [
    { kind: 'segment-start', events: [], segment: { number: 1, label: 'Half' } },
    { kind: 'single', events: [goal('01936f4a-7101-7000-8000-000000000001', 'home', 480, [1, 0])] },
    {
      kind: 'single',
      events: [goal('01936f4a-7102-7000-8000-000000000002', 'away', 1260, [1, 1])],
    },
    {
      kind: 'segment-end',
      events: [],
      segment: { number: 1, label: 'Half', scores: [1, 1] },
    },
  ];
  return {
    ...base,
    status: 'final',
    home: { ...base.home, score: 1 },
    away: { ...base.away, score: 1 },
    timeline,
  };
}

/** A finished match with no recorded events: the timeline says so, and no score is invented. */
export function referenceEmptyTimelineMatchReportModel(): MatchReportModel {
  return { ...referenceMatchReportModel(), status: 'final', timeline: [] };
}

/** An upcoming match whose sides have no recorded roster yet: each shows its registered squad. */
export function referenceRegisteredSquadMatchReportModel(): MatchReportModel {
  const base = referenceMatchReportModel();
  const registered = (members: readonly PublicMatchRosterMemberResponse[]) =>
    members.map((member) => ({
      personId: member.personId,
      name: member.name,
      publicProfileAvailable: true,
      roleLabels: [],
      onField: false,
    }));
  return {
    ...base,
    status: 'upcoming',
    home: {
      ...base.home,
      score: undefined,
      roster: [],
      registeredSquad: registered(REFERENCE_ROSTER_HOME),
    },
    away: {
      ...base.away,
      score: undefined,
      roster: [],
      registeredSquad: registered(REFERENCE_ROSTER_AWAY),
    },
    timeline: [],
  };
}

/** The full match-report model: rosters, officials and a mixed single/workflow timeline. */
export function referenceMatchReportModel(): MatchReportModel {
  const [home, away] = REFERENCE_ENTRANTS;
  const timeline: MatchReportTimelineGroup[] = [
    {
      kind: 'single',
      events: [
        {
          eventId: '01936f4a-7001-7000-8000-000000000001',
          label: 'Kickoff',
          occurredAt: '2026-09-01T18:00:00.000Z',
        },
      ],
    },
    {
      kind: 'workflow',
      events: [
        {
          eventId: '01936f4a-7002-7000-8000-000000000002',
          label: 'Goal recorded',
          occurredAt: '2026-09-01T18:22:00.000Z',
          actor: 'table_ref_1',
        },
        {
          eventId: '01936f4a-7003-7000-8000-000000000003',
          label: 'Correction confirmed',
          occurredAt: '2026-09-01T18:24:00.000Z',
          actor: 'tournament_director',
        },
      ],
    },
  ];
  return {
    organizationName: 'Reference League',
    tournamentName: 'Reference Cup',
    stageNumber: 2,
    matchNumber: 7,
    round: 1,
    status: 'live',
    home: {
      name: home.name,
      abbreviation: home.abbreviation,
      score: 3,
      roster: REFERENCE_ROSTER_HOME.map(withReferenceRoleLabels),
    },
    away: {
      name: away.name,
      abbreviation: away.abbreviation,
      score: 1,
      roster: REFERENCE_ROSTER_AWAY.map(withReferenceRoleLabels),
    },
    scheduledAt: '2026-09-01T18:00:00.000Z',
    venueName: 'Meridian Central Stadium',
    schedulePublished: true,
    officials: REFERENCE_OFFICIALS.map((official) => ({
      name: official.name,
      roleLabels: official.roles.map(humanizeCode),
    })),
    timeline,
  };
}
