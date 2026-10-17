import { publicIntl, sideSourceLabels } from './i18n/public-intl.js';
import {
  formatQualifier,
  formatSideSource,
  sourceMatchLabel,
  formatPlacementSource,
  formatPlacement,
  finalRoundOf,
  placementOf,
} from './side-source.js';

const locales = ['en', 'es', 'fr', 'pt', 'it', 'de', 'ru', 'zh'] as const;
const prefixes = [
  'Winner of ',
  'Ganador de ',
  'Vainqueur de ',
  'Vencedor de ',
  'Vincitore di ',
  'Sieger aus ',
  'Победитель: ',
  '',
];

it.each(locales)('formats every source kind and compact forms in %s', (locale) => {
  const labels = sideSourceLabels(publicIntl(locale));
  const winner = { kind: 'winner-of' as const, nodeKey: 'SE-R2-M1', round: 2, position: 1 };
  const match = sourceMatchLabel(winner, labels, 3);
  const formatted = formatSideSource(winner, labels, match);
  expect(formatted.long).toBe(
    locale === 'zh' ? `${match?.long}的胜者` : `${prefixes[locales.indexOf(locale)]}${match?.long}`,
  );
  expect(formatted.short.length).toBeLessThan(formatted.long.length);
  expect(formatted.short).not.toMatch(/[{}]/);
  expect(formatSideSource({ ...winner, kind: 'loser-of' }, labels, match).long).not.toBe(
    formatted.long,
  );
  expect(formatSideSource({ kind: 'seed', seed: 3 }, labels).long).toContain('3');
  expect(formatSideSource({ kind: 'bye' }, labels).long).toBe(labels.bye);
  for (const source of [
    undefined,
    { kind: 'entrant' as const },
    { kind: 'qualifier' as const },
    { kind: 'pending' as const },
  ]) {
    expect(formatSideSource(source, labels)).toEqual({
      long: labels.unknown,
      short: labels.unknown,
    });
  }
  expect(formatPlacementSource('placement-3', labels)).toContain('3');
  expect(formatPlacementSource('placement-5-8', labels)).toContain('5–8');
});

it('names elimination rounds from actual depth, never from an assumed entrant count', () => {
  const labels = sideSourceLabels(publicIntl('en'));
  const source = { kind: 'winner-of' as const, nodeKey: 'SE-R2-M1' };
  expect(sourceMatchLabel(source, labels, 3)).toEqual({ long: 'Semi-final 1', short: 'SF1' });
  expect(sourceMatchLabel(source, labels, 4)).toEqual({ long: 'Quarter-final 1', short: 'QF1' });
  expect(sourceMatchLabel(source, labels, 2)).toEqual({ long: 'Final', short: 'F' });
  expect(sourceMatchLabel(source, labels, 6)?.long).toBe('Round 2, match 1');
  expect(sourceMatchLabel(source, labels)?.long).toBe('Round 2, match 1');
  expect(sourceMatchLabel({ ...source, nodeKey: 'LB-R2-M1' }, labels, 3)?.long).toBe(
    'Round 2, match 1',
  );
});

it('formats placement sources without reading an English API display label', () => {
  const labels = sideSourceLabels(publicIntl('es'));
  expect(formatSideSource({ kind: 'winner-of', nodeKey: 'placement-5-8' }, labels)).toEqual({
    long: 'Ganador de Puestos 5–8',
    short: 'G Puestos 5–8',
  });
  expect(formatPlacementSource('place-3', labels)).toBe('Puesto 3');
  expect(formatPlacementSource('unknown', labels)).toBeUndefined();
});

it('handles legacy numbered sources without exposing opaque or structural ids', () => {
  const labels = sideSourceLabels(publicIntl('en'));
  expect(formatSideSource({ kind: 'winner-of', matchNumber: 7 }, labels).long).toBe(
    'Winner of Match 7',
  );
  expect(
    formatSideSource({ kind: 'loser-of', matchId: '0199b000-0000-7000-8000-000000000001' }, labels)
      .long,
  ).toBe(labels.unknown);
  expect(sourceMatchLabel({ kind: 'winner-of', round: 2, position: 3 }, labels)?.long).toBe(
    'Round 2, match 3',
  );
  expect(formatSideSource({ kind: 'seed' }, labels).long).toBe('Seed');
});

it('reads only a known single-elimination depth', () => {
  expect(finalRoundOf([])).toBeUndefined();
  expect(finalRoundOf([{ nodeKey: 'WB-R3-M1', round: 3 }])).toBeUndefined();
  expect(
    finalRoundOf([
      { nodeKey: 'SE-R1-M1', round: 1 },
      { nodeKey: 'SE-R3-M1', round: 3 },
    ]),
  ).toBe(3);
  expect(finalRoundOf([{ nodeKey: 'SE-R1-M1' }])).toBe(0);
});

it('reads the places a placement game settles from structural keys', () => {
  const keys = ['PL5-R1-M1', 'PL5-R1-M2', 'PL9-R2-M1', 'PL9-R2-M2', 'placement-5', 'SE-R1-M1'];
  expect(placementOf('placement-3', keys)).toEqual({ from: 3 });
  expect(placementOf('PL5-R1-M2', keys)).toEqual({ from: 5, to: 8 });
  expect(placementOf('PL9-R2-M1', keys)).toEqual({ from: 9, to: 12 });
  expect(placementOf('SE-R1-M1', keys)).toBeUndefined();
  expect(placementOf(undefined, keys)).toBeUndefined();
  const labels = sideSourceLabels(publicIntl('de'));
  expect(formatPlacement({ from: 3 }, labels)).toContain('3');
  expect(formatPlacement({ from: 5, to: 8 }, labels)).toContain('5–8');
});

describe('qualifier positions', () => {
  const groupRank = (rank: number, groupName?: string) => ({
    kind: 'qualifier' as const,
    position: rank,
    qualifierLabel: {
      kind: 'group-rank' as const,
      rank,
      groupNumber: 1,
      ...(groupName === undefined ? {} : { groupName }),
    },
  });
  const cohort = (rank: number, order: number) => ({
    kind: 'qualifier' as const,
    position: 5,
    qualifierLabel: { kind: 'cohort' as const, rank, order },
  });

  it('reads a group position, a ranked cohort and a manual number in English', () => {
    const labels = sideSourceLabels(publicIntl('en'));
    expect(formatSideSource(groupRank(1, 'Group A'), labels)).toEqual({
      long: '1st Group A',
      short: '1A',
    });
    expect(formatSideSource(groupRank(2, 'Group B'), labels).long).toBe('2nd Group B');
    expect(formatSideSource(groupRank(3), labels).long).toBe('3rd Group 1');
    expect(formatSideSource(cohort(1, 1), labels).long).toBe('Best 1st');
    expect(formatSideSource(cohort(2, 2), labels).long).toBe('2nd best runner-up');
    expect(formatSideSource(cohort(4, 3), labels).long).toBe('3rd best 4th');
    expect(formatSideSource(cohort(2, 2), labels).short).toBe('Q5');
    expect(
      formatSideSource(
        { kind: 'qualifier', position: 5, qualifierLabel: { kind: 'number', number: 5 } },
        labels,
      ),
    ).toEqual({ long: 'Qualifier 5', short: 'Q5' });
  });

  it('falls back to the position number without a label, and to unknown without either', () => {
    const labels = sideSourceLabels(publicIntl('en'));
    expect(formatQualifier({ kind: 'qualifier', position: 7 }, labels).long).toBe('Qualifier 7');
    expect(formatQualifier({ kind: 'qualifier' }, labels).long).toBe(labels.unknown);
  });

  it('keeps the compact form short when a group name ends in no letter', () => {
    const labels = sideSourceLabels(publicIntl('en'));
    expect(formatSideSource(groupRank(1, 'Zona Norte'), labels).short).toBe('Q1');
  });

  it.each(locales)('names every qualifier kind without placeholders in %s', (locale) => {
    const labels = sideSourceLabels(publicIntl(locale));
    for (const source of [
      groupRank(1, 'Grupo A'),
      groupRank(12),
      cohort(1, 1),
      cohort(2, 2),
      cohort(5, 4),
      { kind: 'qualifier' as const, position: 9 },
    ]) {
      const text = formatSideSource(source, labels);
      expect(text.long).not.toMatch(/[{}]/);
      expect(text.short).not.toMatch(/[{}]/);
      expect(text.long.length).toBeGreaterThan(0);
    }
    expect(formatSideSource(groupRank(1, 'Grupo A'), labels).long).toContain('Grupo A');
    expect(formatSideSource(cohort(2, 2), labels).long).not.toBe(
      formatSideSource(cohort(2, 1), labels).long,
    );
  });

  it('reads the Spanish and German forms an organizer sees', () => {
    const es = sideSourceLabels(publicIntl('es'));
    expect(formatSideSource(groupRank(1, 'Grupo A'), es).long).toBe('1.° Grupo A');
    expect(formatSideSource(cohort(2, 2), es).long).toBe('2.° mejor segundo');
    const de = sideSourceLabels(publicIntl('de'));
    expect(formatSideSource(groupRank(2, 'Gruppe B'), de).long).toBe('2. Gruppe B');
  });
});
