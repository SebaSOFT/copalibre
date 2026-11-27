/** Schedule and group match fixtures. */

import type { MatchCardData } from '../matches-view.js';
import type { ScheduleStage } from '../match-schedule.js';
import { type OverviewMatch } from '../overview.js';
import { REFERENCE_ENTRANTS } from './entrants.ts';
import { referenceBracket } from './brackets.ts';

/**
 * The results the standings above are computed from, including the head-to-head
 * that separates the tied leaders — Meridian Seven 2:1 Obsidian Rift.
 */
export function referenceGroupMatches(): readonly OverviewMatch[] {
  const [meridian, ironclad, obsidian, echo] = REFERENCE_ENTRANTS;
  const side = (e: (typeof REFERENCE_ENTRANTS)[number], score: number) => ({
    name: e.name,
    abbreviation: e.abbreviation,
    score,
  });
  return [
    {
      matchNumber: 1,
      stageNumber: 1,
      home: side(meridian, 2),
      away: side(obsidian, 1),
      state: 'final',
      startsAt: '2026-09-01T18:00:00.000Z',
    },
    {
      matchNumber: 2,
      stageNumber: 1,
      home: side(ironclad, 2),
      away: side(meridian, 1),
      state: 'final',
      startsAt: '2026-09-01T20:30:00.000Z',
    },
    {
      matchNumber: 3,
      stageNumber: 1,
      home: side(meridian, 3),
      away: side(echo, 0),
      state: 'final',
      startsAt: '2026-09-03T18:00:00.000Z',
    },
    {
      matchNumber: 4,
      stageNumber: 1,
      home: side(obsidian, 2),
      away: side(ironclad, 0),
      state: 'final',
      startsAt: '2026-09-03T20:30:00.000Z',
    },
    {
      matchNumber: 5,
      stageNumber: 1,
      home: side(obsidian, 1),
      away: side(echo, 0),
      state: 'final',
      startsAt: '2026-09-05T18:00:00.000Z',
    },
    {
      matchNumber: 6,
      stageNumber: 1,
      home: side(ironclad, 1),
      away: side(echo, 1),
      state: 'final',
      startsAt: '2026-09-05T20:30:00.000Z',
    },
  ];
}

/**
 * A persisted four-team cup on its programme before it is played out: the first semi-final
 * decided, the second still live, so the final is partially decided and the third-place game
 * names both its sources. Sources carry structure only; the formatter words them per locale.
 */
export function referenceUndecidedMatches(): readonly MatchCardData[] {
  const semi = (position: number) =>
    ({ kind: 'winner-of', nodeKey: `SE-R1-M${position}`, round: 1, position }) as const;
  const base = { stageNumber: 2, zoneName: 'Copa de Oro', venueName: 'Cancha 1' } as const;
  return [
    {
      ...base,
      matchId: '0199b000-0000-7000-8000-00000000c001',
      nodeKey: 'SE-R1-M1',
      matchNumber: 1,
      round: 1,
      state: 'final',
      homeName: 'Lomas de Rivadavia',
      homeAbbreviation: 'LOM',
      homeScore: 2,
      awayName: 'Club Hispano',
      awayAbbreviation: 'HIS',
      awayScore: 0,
    },
    {
      ...base,
      matchId: '0199b000-0000-7000-8000-00000000c002',
      nodeKey: 'SE-R1-M2',
      matchNumber: 2,
      round: 1,
      state: 'live',
      homeName: 'Red Star',
      homeAbbreviation: 'STA',
      homeScore: 1,
      awayName: 'Corazonistas Bogotá',
      awayAbbreviation: 'BOG',
      awayScore: 1,
      clockSeconds: 2310,
    },
    {
      ...base,
      matchId: '0199b000-0000-7000-8000-00000000c003',
      nodeKey: 'SE-R2-M1',
      matchNumber: 3,
      round: 2,
      state: 'upcoming',
      scheduledAt: '2026-11-08T20:00:00.000Z',
      homeName: 'Lomas de Rivadavia',
      homeAbbreviation: 'LOM',
      homeSource: semi(1),
      awaySource: semi(2),
    },
    {
      ...base,
      matchId: '0199b000-0000-7000-8000-00000000c004',
      nodeKey: 'placement-3',
      matchNumber: 4,
      round: 1,
      state: 'upcoming',
      scheduledAt: '2026-11-08T18:00:00.000Z',
      homeName: 'Club Hispano',
      homeAbbreviation: 'HIS',
      homeSource: { ...semi(1), kind: 'loser-of' },
      awaySource: { ...semi(2), kind: 'loser-of' },
    },
  ];
}

/**
 * A two-stage schedule: a group stage of two groups and a cup stage drawn as its bracket, so the
 * schedule organism's tables, round sub-headings and bracket zone each have something to show.
 */
/** Every listed match of the reference schedule, flat, as a phone's day list takes them. */
export function referenceScheduleRows(): readonly MatchCardData[] {
  return referenceSchedule().flatMap((stage) =>
    stage.zones.flatMap((zone) =>
      zone.kind === 'rows'
        ? zone.groups.flatMap((group) => group.rounds.flatMap((round) => round.matches))
        : [],
    ),
  );
}

export function referenceSchedule(): readonly ScheduleStage[] {
  const [meridian, ironclad, obsidian, echo] = REFERENCE_ENTRANTS;
  const row = (
    matchNumber: number,
    round: number,
    groupName: string,
    home: (typeof REFERENCE_ENTRANTS)[number],
    away: (typeof REFERENCE_ENTRANTS)[number],
    scores?: readonly [number, number],
  ): MatchCardData => ({
    matchId: `reference-${matchNumber}`,
    stageNumber: 1,
    matchNumber,
    round,
    state: scores ? 'final' : 'upcoming',
    homeName: home.name,
    homeAbbreviation: home.abbreviation,
    awayName: away.name,
    awayAbbreviation: away.abbreviation,
    ...(scores ? { homeScore: scores[0], awayScore: scores[1] } : {}),
    venueName: 'Reference Arena',
    scheduledAt: `2026-09-0${round}T18:00:00.000Z`,
    zoneName: 'Groups',
    groupName,
  });
  return [
    {
      stageNumber: 1,
      stageName: 'Group stage',
      zones: [
        {
          kind: 'rows',
          groups: [
            {
              name: 'Group A',
              rounds: [
                { round: 1, matches: [row(1, 1, 'Group A', meridian, obsidian, [2, 1])] },
                { round: 2, matches: [row(3, 2, 'Group A', meridian, ironclad)] },
              ],
            },
            {
              name: 'Group B',
              rounds: [{ round: 1, matches: [row(2, 1, 'Group B', ironclad, echo, [0, 0])] }],
            },
          ],
        },
      ],
    },
    {
      stageNumber: 2,
      stageName: 'Cup',
      zones: [{ kind: 'bracket', name: 'Gold Cup', matches: referenceBracket() }],
    },
  ];
}
