import { describe, it, expect } from '@jest/globals';
import {
  describeSlot,
  isResolved,
  matchReportUrl,
  selectStageLayout,
  toRounds,
  toNode,
  type BracketMatch,
  type SlotSource,
} from './bracket.js';
import type { ResultStateLabels } from './result-state.js';

const labels: ResultStateLabels = {
  final: 'Final',
  live: 'En vivo',
  upcoming: 'Programado',
  tbd: 'Por definir',
  disputed: 'Disputado',
  winner: 'Ganador',
  loser: 'Perdedor',
  cancelled: 'Cancelado',
};

describe('describeSlot', () => {
  it('describes entrant slot by name', () => {
    const slot: SlotSource = { kind: 'entrant', name: 'Talleres', abbreviation: 'TAL' };
    expect(describeSlot(slot)).toBe('Talleres');
  });

  it('describes winner-of slot with positive matchNumber', () => {
    const slot: SlotSource = { kind: 'winner-of', matchNumber: 4 };
    expect(describeSlot(slot)).toBe('Ganador del 4');
  });

  it('describes winner-of slot with matchId and strips branch prefixes', () => {
    expect(describeSlot({ kind: 'winner-of', matchId: 'SE-3' })).toBe('Ganador de 3');
    expect(describeSlot({ kind: 'winner-of', matchId: 'WB-10' })).toBe('Ganador de 10');
    expect(describeSlot({ kind: 'winner-of', matchId: 'LB-5' })).toBe('Ganador de 5');
    expect(describeSlot({ kind: 'winner-of', matchId: 'final-match' })).toBe(
      'Ganador de final-match',
    );
  });

  it('describes winner-of fallback as Por definir when no matchNumber or matchId is valid', () => {
    expect(describeSlot({ kind: 'winner-of', matchId: '—' })).toBe('Por definir');
    expect(describeSlot({ kind: 'winner-of', matchNumber: 0 })).toBe('Por definir');
    expect(describeSlot({ kind: 'winner-of', matchNumber: Number.NaN })).toBe('Por definir');
    expect(describeSlot({ kind: 'winner-of' })).toBe('Por definir');
  });

  it('describes loser-of slot with positive matchNumber', () => {
    const slot: SlotSource = { kind: 'loser-of', matchNumber: 2 };
    expect(describeSlot(slot)).toBe('Perdedor del 2');
  });

  it('describes loser-of slot with matchId and strips branch prefixes', () => {
    expect(describeSlot({ kind: 'loser-of', matchId: 'WB-1' })).toBe('Perdedor de 1');
    expect(describeSlot({ kind: 'loser-of', matchId: 'LB-2' })).toBe('Perdedor de 2');
    expect(describeSlot({ kind: 'loser-of', matchId: 'SE-8' })).toBe('Perdedor de 8');
    expect(describeSlot({ kind: 'loser-of', matchId: 'semi' })).toBe('Perdedor de semi');
  });

  it('describes loser-of fallback as Por definir when no matchNumber or matchId is valid', () => {
    expect(describeSlot({ kind: 'loser-of', matchId: '—' })).toBe('Por definir');
    expect(describeSlot({ kind: 'loser-of', matchNumber: 0 })).toBe('Por definir');
    expect(describeSlot({ kind: 'loser-of', matchNumber: Number.NaN })).toBe('Por definir');
    expect(describeSlot({ kind: 'loser-of' })).toBe('Por definir');
  });

  it('describes seed slot', () => {
    expect(describeSlot({ kind: 'seed', seed: 1 })).toBe('Sembrado 1');
  });
});

describe('isResolved', () => {
  it('returns true when all slots are entrant', () => {
    const match: BracketMatch = {
      matchNumber: 1,
      roundNumber: 1,
      branch: 'winners',
      state: 'final',
      slots: [
        { kind: 'entrant', name: 'Alpha' },
        { kind: 'entrant', name: 'Beta' },
      ],
    };
    expect(isResolved(match)).toBe(true);
  });

  it('returns false when any slot is not an entrant', () => {
    const match: BracketMatch = {
      matchNumber: 2,
      roundNumber: 2,
      branch: 'winners',
      state: 'upcoming',
      slots: [
        { kind: 'entrant', name: 'Alpha' },
        { kind: 'winner-of', matchNumber: 1 },
      ],
    };
    expect(isResolved(match)).toBe(false);
  });
});

describe('toRounds', () => {
  it('groups and orders matches into rounds per branch', () => {
    const matches: readonly BracketMatch[] = [
      {
        matchNumber: 3,
        roundNumber: 2,
        branch: 'winners',
        state: 'upcoming',
        slots: [],
      },
      {
        matchNumber: 1,
        roundNumber: 1,
        branch: 'winners',
        state: 'final',
        slots: [],
      },
      {
        matchNumber: 2,
        roundNumber: 1,
        branch: 'winners',
        state: 'final',
        slots: [],
      },
      {
        matchNumber: 4,
        roundNumber: 1,
        branch: 'losers',
        state: 'upcoming',
        slots: [],
      },
    ];

    const rounds = toRounds(matches);
    expect(rounds).toHaveLength(3);
    expect(rounds[0]?.branch).toBe('losers');
    expect(rounds[0]?.roundNumber).toBe(1);
    expect(rounds[1]?.branch).toBe('winners');
    expect(rounds[1]?.roundNumber).toBe(1);
    expect(rounds[1]?.matches.map((m) => m.matchNumber)).toEqual([1, 2]);
    expect(rounds[2]?.branch).toBe('winners');
    expect(rounds[2]?.roundNumber).toBe(2);
  });
});

describe('toNode', () => {
  it('builds node view for completed match with scores and abbreviations', () => {
    const match: BracketMatch = {
      matchNumber: 1,
      roundNumber: 1,
      branch: 'winners',
      state: 'final',
      scores: [3, 1],
      resultReasons: ['played', 'walkover'],
      slots: [
        { kind: 'entrant', name: 'Club Alpha', abbreviation: 'ALP' },
        { kind: 'entrant', name: 'Club Beta' },
      ],
    };

    const node = toNode(match, labels);
    expect(node.matchNumber).toBe(1);
    expect(node.state).toBe('final');
    expect(node.slots).toHaveLength(2);
    expect(node.slots[0]).toEqual({
      label: 'Club Alpha',
      fullName: 'Club Alpha',
      abbreviation: 'ALP',
      score: 3,
      state: 'final',
      pending: false,
    });
    expect(node.slots[1]).toEqual({
      label: 'Club Beta',
      fullName: 'Club Beta',
      score: 1,
      resultReason: 'walkover',
      state: 'final',
      pending: false,
    });
  });

  it('builds node view for pending match without scores', () => {
    const match: BracketMatch = {
      matchNumber: 2,
      roundNumber: 2,
      branch: 'winners',
      state: 'upcoming',
      slots: [
        { kind: 'winner-of', matchNumber: 1 },
        { kind: 'winner-of', matchId: 'SE-2' },
      ],
    };

    const node = toNode(match, labels);
    expect(node.matchNumber).toBe(2);
    expect(node.slots[0]?.pending).toBe(true);
    expect(node.slots[0]?.state).toBe('tbd');
    expect(node.slots[0]?.label).toBe('Ganador del 1');
    expect(node.slots[1]?.label).toBe('Ganador de 2');
  });
});

describe('matchReportUrl', () => {
  it('constructs correct report path without locale prefix', () => {
    expect(
      matchReportUrl({
        organizationAlias: 'liga-central',
        tournamentAlias: 'apertura-2026',
        stageNumber: 2,
        matchNumber: 5,
      }),
    ).toBe('/liga-central/tournaments/apertura-2026/stages/2/matches/5');
  });

  it('constructs correct report path with locale prefix', () => {
    expect(
      matchReportUrl({
        organizationAlias: 'liga-central',
        tournamentAlias: 'apertura-2026',
        stageNumber: 1,
        matchNumber: 3,
        localePrefix: '/es',
      }),
    ).toBe('/es/liga-central/tournaments/apertura-2026/stages/1/matches/3');
  });
});

describe('selectStageLayout', () => {
  it('selects bracket layout for single-elimination', () => {
    expect(selectStageLayout('single-elimination')).toBe('bracket');
  });

  it('selects bracket layout for double-elimination and other elimination formats', () => {
    expect(selectStageLayout('double-elimination')).toBe('bracket');
    expect(selectStageLayout('gauntlet')).toBe('bracket');
    expect(selectStageLayout('bracket-groups')).toBe('bracket');
    expect(selectStageLayout('custom-bracket')).toBe('bracket');
    expect(selectStageLayout('ffa-bracket')).toBe('bracket');
  });

  it('selects grid layout for round-robin and non-elimination formats', () => {
    expect(selectStageLayout('round-robin')).toBe('grid');
    expect(selectStageLayout('round-robin-single-leg')).toBe('grid');
    expect(selectStageLayout('round-robin-home-away')).toBe('grid');
    expect(selectStageLayout('league')).toBe('grid');
    expect(selectStageLayout('swiss')).toBe('grid');
    expect(selectStageLayout('ffa-league')).toBe('grid');
  });

  it('defaults to bracket when format is unspecified', () => {
    expect(selectStageLayout(undefined)).toBe('bracket');
  });
});
