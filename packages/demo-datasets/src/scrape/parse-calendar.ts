import * as cheerio from 'cheerio';
import { clean, titleCase } from './text.js';

/** One row of the portal's calendar, before names are matched to teams. */
export interface RawGame {
  readonly gameId: string;
  /** The portal's id for the group or cup this game belongs to. */
  readonly phaseId: string;
  /** For example `Grupo A` or `Copa Oro`. */
  readonly phaseName: string;
  /** For example `Jornada 1` or `Semi finales`. */
  readonly round: string;
  readonly date: string;
  readonly time: string;
  readonly venue: string;
  readonly homeLogoFile: string;
  readonly awayLogoFile: string;
  readonly homeName: string;
  readonly awayName: string;
  readonly homeGoals: number | undefined;
  readonly awayGoals: number | undefined;
  /** The portal's own note under the row, such as the played result versus the regulation one. */
  readonly note: string | undefined;
}

/** `Giornata Jornada 2 - 03/11/2025` and `2º JORNADA` both become `Jornada 2`. */
export function normaliseRound(label: string): string {
  const text = clean(label);
  const numbered =
    /^(?:Giornata\s+)?Jornada\s+(\d+)/i.exec(text) ?? /^(\d+)º\s+JORNADA/i.exec(text);
  if (numbered) return `Jornada ${numbered[1]}`;
  const sentence = text.toLowerCase();
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function phaseName(title: string): string {
  return titleCase(clean(title).split(' - ')[0] ?? title);
}

function score(text: string): [number, number] | undefined {
  const match = /(\d+)\s*-\s*(\d+)/.exec(text);
  return match ? [Number(match[1]), Number(match[2])] : undefined;
}

function logoFile(src: string | undefined): string {
  return (src ?? '').split('/').pop() ?? '';
}

/**
 * Reads the calendar fragment in document order: a phase title sets the
 * current phase, a round header sets the current round, and a row that holds
 * a game-report icon is a game. The portal's rows without that icon are
 * annotations on the game above them.
 */
export function parseCalendar(html: string): RawGame[] {
  const $ = cheerio.load(html);
  const games: RawGame[] = [];
  let phase = '';
  let round = '';
  let pendingNote: { index: number } | undefined;

  $('.div_titulo_fase_idc, thead.head_jornada th, tr.team_class').each((_, element) => {
    const node = $(element);
    if (node.hasClass('div_titulo_fase_idc')) {
      phase = phaseName(node.text());
      return;
    }
    if (element.tagName === 'th') {
      round = normaliseRound(node.text());
      return;
    }
    const report = node.find('i.game_report');
    if (report.length === 0) {
      const note = clean(node.text());
      if (pendingNote && note) {
        const previous = games[pendingNote.index];
        if (previous) games[pendingNote.index] = { ...previous, note };
      }
      return;
    }
    const cells = node.children('td');
    const result = score(clean(node.find('td.web_link_td').first().text()));
    games.push({
      gameId: report.attr('idp') ?? '',
      phaseId: report.attr('idc') ?? '',
      phaseName: phase,
      round,
      date: clean(cells.eq(1).text()),
      time: clean(cells.eq(2).text()),
      venue: titleCase(cells.eq(3).text()),
      homeLogoFile: logoFile(node.find('img.team_logo').eq(0).attr('src')),
      awayLogoFile: logoFile(node.find('img.team_logo').eq(1).attr('src')),
      homeName: clean(node.find('.nombre_junto_logo').eq(0).text()),
      awayName: clean(node.find('.nombre_junto_logo').eq(1).text()),
      homeGoals: result?.[0],
      awayGoals: result?.[1],
      note: undefined,
    });
    pendingNote = { index: games.length - 1 };
  });
  return games;
}
