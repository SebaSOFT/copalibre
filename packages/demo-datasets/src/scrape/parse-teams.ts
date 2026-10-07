import * as cheerio from 'cheerio';
import { clean } from './text.js';

export interface RawTeam {
  /** The portal's team id, for example `1041`. */
  readonly teamId: string;
  readonly logoFile: string;
  readonly abbreviation: string;
  readonly name: string;
}

/**
 * The competition list carries one hidden input per competition,
 * `teams_array_<id>`, holding `logo,teamId,abbreviation,name;...`.
 */
export function parseTeams(listHtml: string, leagueId: string): RawTeam[] {
  const $ = cheerio.load(listHtml);
  const value = $(`#teams_array_${leagueId}`).attr('value');
  if (!value) throw new Error(`competition ${leagueId} has no team list`);
  return value
    .split(';')
    .map((entry) => entry.split(','))
    .filter((parts) => parts.length >= 4)
    .map(([logoFile, teamId, abbreviation, ...name]) => ({
      logoFile: clean(logoFile),
      teamId: clean(teamId),
      abbreviation: clean(abbreviation),
      name: clean(name.join(',')),
    }));
}
