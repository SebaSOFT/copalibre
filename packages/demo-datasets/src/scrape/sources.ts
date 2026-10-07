import type { FormRequest } from './fetch.js';

/** SIDGAD identifiers for the one competition this dataset captures. */
export const LEAGUE_ID = '273';
export const MODALITY_ID = '1';
export const TEMPORADA_ID = '39';
export const TOURNAMENT_LOGO_FILE = '275.png';

const DATA = 'https://www.server2.sidgad.es/worldskate/worldskate_';
const IMAGES = 'https://www.sidgad.com/worldskate/images/logos_clubes/';
const COMPETITION_IMAGES = 'https://sidgad.cloud/worldskate/images/logos_competiciones/';

/** The competition list, which carries each team's id, abbreviation, name and logo file. */
export function competitionListRequest(): FormRequest {
  return { url: `${DATA}ls_${MODALITY_ID}.php` };
}

/** Groups, cup brackets and every game with its score. */
export function calendarRequest(): FormRequest {
  return {
    url: `${DATA}cal_idc_${LEAGUE_ID}_${MODALITY_ID}.php`,
    form: { idc: LEAGUE_ID, tipo_stats: '', lang: 'es', site_lang: 'es' },
  };
}

/** Every rostered player with season totals. */
export function rosterRequest(): FormRequest {
  return {
    url: `${DATA}stats_${MODALITY_ID}_${LEAGUE_ID}.php`,
    form: {
      idc: LEAGUE_ID,
      tipo_stats: 'plantillas',
      filter: '3',
      lang: 'es',
      site_lang: 'es',
    },
  };
}

/** One game's detail: scorers by period and clock, penalties and referees. */
export function gameReportRequest(gameId: string, phaseId: string): FormRequest {
  return {
    url: `${DATA}gr_${gameId}_${MODALITY_ID}.php`,
    form: { idm: MODALITY_ID, idc: phaseId, idp: gameId, tab: 'tab_ficha_resumen', lang: 'es' },
  };
}

export function clubLogoUrl(logoFile: string): string {
  return `${IMAGES}${logoFile}`;
}

export function tournamentLogoUrl(): string {
  return `${COMPETITION_IMAGES}${TOURNAMENT_LOGO_FILE}`;
}
