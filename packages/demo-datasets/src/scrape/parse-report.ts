import * as cheerio from 'cheerio';
import { clean, splitName, type SplitName } from './text.js';

export interface RawGoal {
  readonly period: string;
  readonly clock: string;
  readonly teamLogoFile: string;
  readonly playerId: string;
  /** The scorer as printed on the goal row, used when the season roster lacks them. */
  readonly scorerName: SplitName;
  /** The portal's team id of the scorer, for example `1047`. */
  readonly teamId: string;
  /** For example `falta directa`; empty for an ordinary goal. */
  readonly detail: string;
}

export interface RawSheetRow {
  readonly dorsal: number | undefined;
  readonly goalkeeper: boolean;
  readonly captain: boolean;
  readonly name: SplitName;
  readonly goals: number;
  readonly assists: number;
}

export interface RawReport {
  readonly homeGoals: number;
  readonly awayGoals: number;
  /** The jornada (group) or round (cup) number printed on the match sheet. */
  readonly roundNumber: number | undefined;
  readonly referees: readonly SplitName[];
  readonly goals: readonly RawGoal[];
  readonly homeSheet: readonly RawSheetRow[];
  readonly awaySheet: readonly RawSheetRow[];
}

function integer(text: string): number | undefined {
  const value = Number.parseInt(clean(text), 10);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * A game report has two tabs: the summary (score and goal events) and the
 * match sheet (`div_acta`: referees, jornada, both lineups). Goals come from
 * the summary because those rows carry the scorer's portal id; lineups come
 * from the sheet because they carry dorsals and the goalkeeper and captain
 * marks.
 */
export function parseReport(html: string): RawReport {
  const $ = cheerio.load(html);
  const sheet = $('#div_acta');

  /** The value cell that follows a labelled cell in the sheet header, matched on the Spanish label. */
  const valuesAfter = (label: string): string[] => {
    const values: string[] = [];
    sheet.find('span.lang_label.lang_es').each((_, span) => {
      if (clean($(span).text()) === label)
        values.push(clean($(span).closest('td').next('td').text()));
    });
    return values;
  };

  const tables = sheet
    .find('table.tabla_acta_print')
    .filter((_, table) => clean($(table).find('td').first().text()) === 'Nº');

  const lineup = (index: number): RawSheetRow[] => {
    const rows: RawSheetRow[] = [];
    tables
      .eq(index)
      .find('tr')
      .each((_, element) => {
        const cells = $(element).children('td');
        const name = clean(cells.eq(4).text());
        if (cells.length < 7 || !name || /^N/.test(clean(cells.eq(0).text()))) return;
        rows.push({
          dorsal: integer(cells.eq(0).text()),
          goalkeeper: clean(cells.eq(2).text()) === 'P',
          captain: clean(cells.eq(3).text()) === 'C',
          name: splitName(name),
          goals: integer(cells.eq(5).text()) ?? 0,
          assists: integer(cells.eq(6).text()) ?? 0,
        });
      });
    return rows;
  };

  const goals: RawGoal[] = [];
  $('#div_ficha_resumen tr').each((_, element) => {
    const row = $(element);
    if (row.find('img[src*="icon_gol"]').length === 0) return;
    const scorer = row.find('a[id_player]').first();
    const logo = row.find('img[src*="logos_clubes"]').first().attr('src') ?? '';
    const detail = clean(row.find('.evento_destacado > span.lang_label.lang_es').first().text())
      .replace(/^-\s*/, '')
      .toLowerCase();
    goals.push({
      period: clean(row.find('.game_view_indcidencias_period').first().text()),
      clock: clean(row.find('.game_view_incidencias_time').first().text()),
      teamLogoFile: logo.split('/').pop() ?? '',
      playerId: scorer.attr('id_player') ?? '',
      scorerName: {
        surname: clean(scorer.clone().children().remove().end().text()),
        givenNames: clean(scorer.find('span').text()),
      },
      teamId: scorer.attr('team_id') ?? '',
      detail,
    });
  });

  // One cell can hold two people, `SURNAME, GIVEN - SURNAME GIVEN`.
  const referees = [...valuesAfter('ÁRBITRO'), ...valuesAfter('ÁRBITRO AUXILIAR')]
    .flatMap((cell) => cell.split(/\s+-\s+/))
    .filter((name) => name.length > 0)
    .map(splitName);

  return {
    homeGoals: integer($('#home_score').first().text()) ?? 0,
    awayGoals: integer($('#away_score').first().text()) ?? 0,
    roundNumber: integer(valuesAfter('JORNADA')[0] ?? ''),
    referees,
    goals,
    homeSheet: lineup(0),
    awaySheet: lineup(1),
  };
}
