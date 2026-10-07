import * as cheerio from 'cheerio';
import { clean } from './text.js';

export interface RawPlayer {
  /** The portal's player id. Used only to join sources; it is dropped before anything is committed. */
  readonly playerId: string;
  /** The portal's team id, for example `1041`. */
  readonly teamId: string;
  /** `SURNAME , GIVEN NAMES` as published. */
  readonly fullName: string;
  /** ISO 3166-1 alpha-2, from the flag image. */
  readonly nationality: string | undefined;
  readonly goals: number;
  readonly assists: number;
}

function count(text: string): number {
  const value = Number(clean(text));
  return Number.isFinite(value) ? value : 0;
}

/**
 * The season roster page: one `fila_stats_player` row per rostered person. Staff rows (coaches and
 * delegates) have no player link and a single `STAFF` cell, so they are skipped.
 */
export function parseRoster(html: string): RawPlayer[] {
  const $ = cheerio.load(html);
  const players: RawPlayer[] = [];
  $('tr.fila_stats_player').each((_, element) => {
    const row = $(element);
    const link = row.find('a[id_player]').first();
    if (link.length === 0) return;
    const cells = row.children('td');
    const flag = /\/flags\/\d+\/([A-Z]{2})\.png/.exec(row.find('img.flag').attr('src') ?? '');
    players.push({
      playerId: link.attr('id_player') ?? '',
      teamId: link.attr('team_id') ?? '',
      fullName: clean(link.attr('player_name')),
      nationality: flag?.[1],
      goals: count(cells.eq(5).text()),
      assists: count(cells.eq(8).text()),
    });
  });
  return players;
}
