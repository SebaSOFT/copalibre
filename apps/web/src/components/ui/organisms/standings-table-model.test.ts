import { describe, expect, it } from '@jest/globals';
import { createIntl } from 'react-intl';
import type {
  TableLayoutSummaryResponse,
  TableProjectionResponse,
  TableRowResponse,
} from '@copalibre/api/src/dto/table-projections.dto.js';
import { publicTableLayoutLabel } from '../../../lib/public-table-layout-label.ts';
import { messages } from '../../../lib/i18n/public-messages.en.ts';
import type { ClubView, StandingsRowView } from '../../../lib/overview.ts';
import {
  referencePromotionTableProjection,
  referenceTableLayouts,
  referenceTableProjection,
} from '../../../lib/reference-fixtures.ts';
import { deriveStandingsView, type StandingsTableProps } from './standings-table-model.ts';

const intl = createIntl({ locale: 'en', onError: () => undefined });

function derive(overrides: Partial<StandingsTableProps> = {}) {
  return deriveStandingsView({ intl, ...overrides } as StandingsTableProps);
}

function previewRow(
  overrides: Partial<StandingsRowView> & { readonly name: string },
): StandingsRowView {
  return { position: 1, played: 3, points: 7, ...overrides };
}

function layoutByCode(code: string): TableLayoutSummaryResponse {
  const found = referenceTableLayouts().find((layout) => layout.code === code);
  if (found === undefined) throw new Error(`no reference layout ${code}`);
  return found;
}

const playerLayout = layoutByCode('top-scorers');

function playerProjection(names: readonly string[]): TableProjectionResponse {
  const rows = names.map((name, index) => ({
    actorId: `actor-${index}`,
    actorName: name,
    cells: {
      name: { formatted: name },
      goals: { raw: index + 1, formatted: String(index + 1) },
    },
    shirtNumber: index + 1,
  })) as unknown as TableRowResponse[];
  return {
    layoutCode: 'top-scorers',
    target: 'player-ranking',
    label: 'Top Scorers',
    columns: [
      { code: 'name', header: 'Player', format: 'text' },
      { code: 'goals', header: 'G', format: 'number' },
    ],
    defaultSort: [{ columnCode: 'goals', direction: 'desc' }],
    rows,
    projectionVersion: 1,
  } as TableProjectionResponse;
}

describe('deriveStandingsView', () => {
  it('renders a full projection as a section headed by its layout label', () => {
    const layout = layoutByCode('group-table');
    const view = derive({
      projection: referenceTableProjection(),
      layout,
      sectionId: 'group-a',
    });

    expect(view.Wrapper).toBe('section');
    expect(view.showHeader).toBe(true);
    expect(view.showTable).toBe(true);
    expect(view.showFooter).toBe(true);
    expect(view.heading).toBe(publicTableLayoutLabel(layout, intl));
    expect(view.effectiveLayoutCode).toBe('group-table');
    expect(view.idPrefix).toBe('group-a');
    expect(view.groupHeading).toBeUndefined();
  });

  it('uses the active layout code ahead of the layout prop', () => {
    const view = derive({
      projection: referenceTableProjection(),
      layout: referenceTableLayouts()[0],
      activeLayoutCode: 'top-scorers',
    });

    expect(view.effectiveLayoutCode).toBe('top-scorers');
  });

  it('renders the table alone as a div under table-only chrome', () => {
    const view = derive({ projection: referenceTableProjection(), chrome: 'table-only' });

    expect(view.Wrapper).toBe('div');
    expect(view.isTableOnly).toBe(true);
    expect(view.showHeader).toBe(false);
    expect(view.showTable).toBe(true);
    expect(view.showFooter).toBe(false);
  });

  it('splits the chrome into a header part and a footer part', () => {
    const header = derive({ projection: referenceTableProjection(), renderPart: 'header' });
    expect(header.Wrapper).toBe('div');
    expect([header.showHeader, header.showTable, header.showFooter]).toEqual([true, false, false]);

    const footer = derive({ projection: referenceTableProjection(), renderPart: 'footer' });
    expect([footer.showHeader, footer.showTable, footer.showFooter]).toEqual([false, false, true]);
  });

  it('names a group and slugs its id, falling back to "group" when nothing slugs', () => {
    const named = derive({ projection: referenceTableProjection(), heading: 'Zona A!!' });
    expect(named.groupHeading).toBe(
      intl.formatMessage(messages.standingsGroupHeading, { group: 'Zona A!!' }),
    );
    expect(named.idPrefix).toBe('zona-a');

    const unslugged = derive({ projection: referenceTableProjection(), heading: '!!!' });
    expect(unslugged.idPrefix).toBe('group');
  });

  it('takes an explicit heading text ahead of the layout label', () => {
    expect(derive({ projection: referenceTableProjection(), headingText: 'Custom' }).heading).toBe(
      'Custom',
    );
  });

  it('falls back to the standings heading when there is no layout', () => {
    expect(derive().heading).toBe(intl.formatMessage(messages.standingsHeading));
  });

  it('builds the fixed rank, name and points columns for preview rows', () => {
    const view = derive({
      previewRows: [
        previewRow({ name: 'Alfa', entrantId: 'e-1', abbreviation: 'ALF', position: 1 }),
        previewRow({ name: 'Bravo', position: 2 }),
      ],
      previewGrain: 'match',
    });

    expect(view.displayColumns.map((c) => c.code)).toEqual(['rank', 'name', 'points']);
    expect(view.rowClassNames).toEqual(['cl-row', 'cl-row--alt']);
    expect(view.grain).toBe('match');
    expect(view.initialSortColumnCode).toBeUndefined();
    expect(view.isSortableColumn('points')).toBe(false);
  });

  it('marks a row whose club is highlighted, resolving the club from its id when the alias is unusable', () => {
    const clubs = [{ clubId: 'club-id-1', alias: 'club-uno' } as ClubView];
    const view = derive({
      previewRows: [
        previewRow({ name: 'Alfa', clubAlias: 'club-uno' }),
        previewRow({ name: 'Bravo', clubAlias: 'Not A Valid Alias!', clubId: 'club-id-1' }),
        previewRow({ name: 'Charlie', clubAlias: 'club-otro' }),
      ],
      clubs,
      highlightClubAlias: 'club-uno',
    });

    expect(view.rowClassNames).toEqual([
      'cl-row cl-standings-row--highlighted',
      'cl-row--alt cl-standings-row--highlighted',
      'cl-row',
    ]);
    expect(view.resolveRowClubAlias({ actorName: 'x', cells: {}, clubId: 'club-id-1' })).toBe(
      'club-uno',
    );
    expect(view.resolveRowClubAlias({ actorName: 'x', cells: {} })).toBeUndefined();
  });

  it('marks promotion rows and adds the qualification columns', () => {
    const view = derive({ projection: referencePromotionTableProjection() });

    expect(view.promotionBands).toHaveLength(2);
    expect(view.displayColumns.map((c) => c.code)).toEqual(
      expect.arrayContaining(['__promotion', '__promotionOrder']),
    );
    const order = view.displayColumns.find((c) => c.code === '__promotionOrder');
    expect(order?.description).toBe(intl.formatMessage(messages.standingsPromotionOrderHint));
    expect(view.rowClassNames[0]).toBe('cl-standings-row--promotion');
    expect(
      view.rowClassNames.every((c) => c === undefined || c === 'cl-standings-row--promotion'),
    ).toBe(true);
  });

  it('keeps only the promotion bands of the source zone', () => {
    const view = derive({
      projection: referencePromotionTableProjection(),
      sourceZoneName: 'Zona A',
    });

    expect(view.promotionBands).toHaveLength(0);
  });

  it('relabels the count column of a series-grain projection', () => {
    const projection: TableProjectionResponse = {
      ...referenceTableProjection(),
      grain: 'series',
      countColumnCode: 'played',
    };
    const view = derive({ projection });

    expect(view.grain).toBe('series');
    expect(view.displayColumns.find((c) => c.code === 'played')?.header).toBe(
      intl.formatMessage(messages.standingsColumnSeriesLabel),
    );
  });

  it('places the shirt number before the name on a player ranking, or last without a name column', () => {
    const withName = derive({
      projection: playerProjection(['Ana', 'Bruno']),
      layout: playerLayout,
    });
    expect(withName.displayColumns.map((c) => c.code)).toEqual(['__shirtNumber', 'name', 'goals']);

    const noName: TableProjectionResponse = {
      ...playerProjection(['Ana']),
      columns: [{ code: 'goals', header: 'G', format: 'number' }],
    };
    const lastNumber = derive({ projection: noName, layout: playerLayout });
    expect(lastNumber.displayColumns.map((c) => c.code)).toEqual(['goals', '__shirtNumber']);
  });

  it('searches the rows of a player ranking, and not in the footer or without controls', () => {
    const projection = playerProjection(['Ana', 'Bruno']);
    const searched = derive({ projection, layout: playerLayout, searchQuery: 'ana' });

    expect(searched.showSearch).toBe(true);
    expect(searched.effectiveSearchQuery).toBe('ana');
    expect(searched.rows.map((r) => r.actorName)).toEqual(['Ana']);

    const footer = derive({
      projection,
      layout: playerLayout,
      searchQuery: 'ana',
      renderPart: 'footer',
    });
    expect(footer.showSearch).toBe(false);
    expect(footer.effectiveSearchQuery).toBe('');

    const noControls = derive({
      projection,
      layout: playerLayout,
      searchQuery: 'ana',
      showControls: false,
    });
    expect(noControls.showSearch).toBe(false);
    expect(noControls.rows).toHaveLength(2);
  });

  it('filters the club to a club query and drops the tie-break line', () => {
    const byAlias = derive({ projection: referenceTableProjection(), activeClubAlias: 'club-a' });
    expect(byAlias.activeClubQuery).toBe('club=club-a');
    expect(byAlias.tieBreaks).toEqual([]);

    const byId = derive({ projection: referenceTableProjection(), activeClubId: 'id 1' });
    expect(byId.activeClubQuery).toBe('clubId=id%201');

    const none = derive({ projection: referenceTableProjection() });
    expect(none.activeClubQuery).toBeUndefined();
    expect(Array.isArray(none.tieBreaks)).toBe(true);
  });

  it('keeps the tie-break line empty for a player ranking', () => {
    const view = derive({ projection: playerProjection(['Ana']), layout: playerLayout });

    expect(view.tieBreaks).toEqual([]);
  });

  it('sorts by the rank column when present, otherwise by the first sortable column', () => {
    const byFirst = derive({ projection: referenceTableProjection() });
    expect(byFirst.initialSortColumnCode).toBe('played');
    expect(byFirst.isSortableColumn('__promotion')).toBe(false);

    const noControls = derive({ projection: referenceTableProjection(), showControls: false });
    expect(noControls.initialSortColumnCode).toBeUndefined();
    expect(noControls.isSortableColumn('played')).toBe(false);
  });

  it('keeps position, name, played and points on a phone and the other columns in a disclosure', () => {
    const view = derive({ projection: referenceTableProjection() });

    expect(view.priorityOf('points')).toBeUndefined();
    expect(view.priorityOf('wins')).toBe('low');
    expect(view.lowColumnIndexes).toEqual(
      view.displayColumns.flatMap((c, i) =>
        c.code === 'played' || c.code === 'points' ? [] : [i],
      ),
    );
    expect(view.hostColumnIndex).toBe(0);
    expect(view.fillColumnIndex).toBe(-1);
  });

  it('hosts the disclosure and fills the name column of a preview table', () => {
    const view = derive({ previewRows: [previewRow({ name: 'Alfa' })] });

    expect(view.fillColumnIndex).toBe(1);
    expect(view.hostColumnIndex).toBe(1);
    expect(view.lowColumnIndexes).toEqual([]);
  });

  it('lists a legend entry only for a column that has a hint', () => {
    const view = derive({ projection: referenceTableProjection() });

    expect(view.legend.every((entry) => entry.hint !== undefined)).toBe(true);
  });

  it('carries the locale and the role labels into the player dialog', () => {
    const view = derive({ projection: referenceTableProjection() });

    expect(view.playerDialogLabels.locale).toBe('en');
    expect(view.playerDialogLabels.roles).toEqual({
      player: intl.formatMessage(messages.playerProfileRolePlayer),
      substitute: intl.formatMessage(messages.playerProfileRoleSubstitute),
      coach: intl.formatMessage(messages.playerProfileRoleCoach),
      staff: intl.formatMessage(messages.playerProfileRoleStaff),
    });
  });

  it('prefixes local paths with a non-English locale', () => {
    const spanish = createIntl({ locale: 'es', onError: () => undefined });
    expect(deriveStandingsView({ intl: spanish } as StandingsTableProps).localePrefix).toBe('/es');
    expect(derive().localePrefix).toBe('');
  });
});
