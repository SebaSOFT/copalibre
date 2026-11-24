import { describe, expect, it } from '@jest/globals';
import { competitionContext } from './competition-context.js';
import { competitionContextLabels, publicIntl } from './i18n/public-intl.js';

describe('competitionContext', () => {
  const esLabels = competitionContextLabels(publicIntl('es'));
  const cupZoneKeys = [
    'SE-R1-M1',
    'SE-R1-M2',
    'SE-R1-M3',
    'SE-R1-M4',
    'SE-R2-M1',
    'SE-R2-M2',
    'SE-R3-M1',
    'PL5-R1-M1',
    'PL5-R1-M2',
    'placement-3',
    'placement-5',
    'placement-7',
  ];

  it('omits the implicit Grupos zone when a group stage names its groups', () => {
    const ctx = competitionContext(
      {
        stageNumber: 1,
        stageName: 'Fase de grupos',
        zoneName: 'Grupos',
        groupName: 'Grupo A',
        round: 1,
        matchNumber: 1,
      },
      esLabels,
    );

    expect(ctx.parts).toEqual(['Fase de grupos', 'Grupo A', 'Ronda 1']);
    expect(ctx.line).toBe('Fase de grupos · Grupo A · Ronda 1');
    expect(ctx.matchLabel).toBe('Partido 1');
  });

  it('names cup quarter-finals from graph depth', () => {
    const ctx = competitionContext(
      {
        stageNumber: 2,
        stageName: 'Copas',
        zoneName: 'Copa Oro',
        nodeKey: 'SE-R1-M1',
        round: 1,
        matchNumber: 1,
        sourceFinalRound: 3,
        zoneNodeKeys: cupZoneKeys,
      },
      esLabels,
    );

    expect(ctx.line).toBe('Copas · Copa Oro · Cuartos de final');
    expect(ctx.matchLabel).toBe('Partido 1');
  });

  it('names a two-round 5th-to-8th placement semi-final with Semifinal and the zone range', () => {
    const ctx = competitionContext(
      {
        stageNumber: 2,
        stageName: 'Copas',
        zoneName: 'Copa Oro',
        nodeKey: 'PL5-R1-M1',
        round: 1,
        matchNumber: 5,
        sourceFinalRound: 3,
        zoneNodeKeys: cupZoneKeys,
      },
      esLabels,
    );

    expect(ctx.line).toBe('Copas · Copa Oro · Semifinal 5º al 8º puesto');
    expect(ctx.matchLabel).toBe('Partido 5');
  });

  it('names a cup final and keeps match number secondary', () => {
    const ctx = competitionContext(
      {
        stageNumber: 2,
        stageName: 'Copas',
        zoneName: 'Copa Bronce',
        nodeKey: 'SE-R3-M1',
        round: 3,
        matchNumber: 36,
        sourceFinalRound: 3,
        zoneNodeKeys: cupZoneKeys,
      },
      esLabels,
    );

    expect(ctx.line).toBe('Copas · Copa Bronce · Final');
    expect(ctx.matchLabel).toBe('Partido 36');
  });

  it('falls back to numbered stage and round when organizer names and zones are absent', () => {
    const ctx = competitionContext(
      {
        stageNumber: 1,
        round: 2,
        matchNumber: 4,
      },
      esLabels,
    );

    expect(ctx.line).toBe('Fase 1 · Ronda 2');
    expect(ctx.matchLabel).toBe('Partido 4');
  });

  it('formats a single placement match without Semifinal prefix', () => {
    const ctx = competitionContext(
      {
        stageNumber: 2,
        stageName: 'Copas',
        zoneName: 'Copa Plata',
        nodeKey: 'placement-5',
        round: 2,
        matchNumber: 20,
        zoneNodeKeys: cupZoneKeys,
      },
      esLabels,
    );

    expect(ctx.line).toBe('Copas · Copa Plata · 5º puesto');
    expect(ctx.matchLabel).toBe('Partido 20');
  });
});
