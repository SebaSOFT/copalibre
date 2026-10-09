import { describe, expect, it } from 'vitest';
import type { TableLayoutDefinition } from '@copalibre/domain';
import { describeColumns } from './column-descriptions.js';

const layout = {
  code: 'standings',
  target: 'group-phase',
  label: { en: 'Standings' },
  entityGranularity: 'team',
  defaultSort: [],
  columns: [
    {
      code: 'played',
      header: { en: 'P', es: 'PJ' },
      source: { kind: 'collector', code: 'played' },
      format: 'number',
    },
    {
      code: 'gf',
      header: { en: 'GF', es: 'GF' },
      source: { kind: 'collector', code: 'goals-for' },
      format: 'number',
    },
    {
      code: 'ga',
      header: { en: 'GA', es: 'GC' },
      source: { kind: 'collector', code: 'goals-against' },
      format: 'number',
    },
    {
      code: 'gd',
      header: { en: 'GD', es: 'Dif' },
      source: { kind: 'computed', expression: 'gf - ga' },
      format: 'number',
    },
    {
      code: 'avg',
      header: { en: 'Avg', es: 'Prom.' },
      source: { kind: 'computed', expression: 'gf / max(ga, 1)' },
      format: 'decimal-2',
    },
    { code: 'rank', header: { en: '#' }, source: { kind: 'rank' }, format: 'number' },
  ],
} as unknown as TableLayoutDefinition;

const descriptor = {
  statistics: [
    { code: 'played', label: { en: 'Played', es: 'Jugados' }, aggregation: 'count' },
    { code: 'goals-for', label: { en: 'Goals for', es: 'Goles a favor' }, aggregation: 'sum' },
  ],
  collectors: [],
} as never;

describe('describeColumns', () => {
  const described = describeColumns(layout, descriptor);

  it('takes a collector column’s wording from the statistic it counts', () => {
    expect(described.played).toEqual({ en: 'Played', es: 'Jugados' });
    expect(described.gf).toEqual({ en: 'Goals for', es: 'Goles a favor' });
  });

  it('leaves a column whose statistic declares no label undescribed', () => {
    expect(described.ga).toBeUndefined();
  });

  it('spells a computed column out in the headers of the columns it uses, per language', () => {
    expect(described.gd).toEqual({ en: 'GF − GA', es: 'GF − GC' });
    expect(described.avg).toEqual({ en: 'GF / max(GA, 1)', es: 'GF / max(GC, 1)' });
  });

  it('describes nothing for a rank column', () => {
    expect(described.rank).toBeUndefined();
  });
});
