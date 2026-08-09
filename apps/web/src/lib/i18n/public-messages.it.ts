/**
 * Italian translations, keyed to match `public-messages.en.ts`'s IDs exactly
 * (0056). Best-effort translation; native-speaker review is a later pass
 * (owner's explicit choice, 0051).
 */
export const messages: Record<string, string> = {
  'publicWeb.layout.skipToContent': 'Vai al contenuto',
  'publicWeb.layout.navAriaLabel': 'Principale',
  'publicWeb.layout.footer': 'Pubblicato con CopaLibre — AGPL-3.0',

  'publicWeb.resultState.live': 'IN DIRETTA',
  'publicWeb.resultState.upcoming': 'PROGRAMMATO',
  'publicWeb.resultState.final': 'FINALE',
  'publicWeb.resultState.disputed': 'IN DISPUTA',
  'publicWeb.resultState.winner': 'VINTO',
  'publicWeb.resultState.loser': 'PERSO',
  'publicWeb.resultState.tbd': 'DA DEFINIRE',
  'publicWeb.resultState.cancelled': 'ANNULLATO',

  'publicWeb.legend.heading': 'Legenda',

  'publicWeb.ruleset.heading': 'Regolamento',

  'publicWeb.standings.heading': 'Classifica',
  'publicWeb.standings.empty': 'La classifica appare dopo la prima partita giocata.',
  'publicWeb.standings.team': 'Squadra',
  'publicWeb.standings.played': 'PG',
  'publicWeb.standings.points': 'Pti',

  'publicWeb.hero.liveCount': '{count} IN DIRETTA',
  'publicWeb.hero.noLiveMatches': 'NESSUNA PARTITA IN DIRETTA',

  'publicWeb.bracket.roundAriaLabel': '{branch} — turno {round}',
  'publicWeb.bracket.roundHeading': 'Turno {round}',

  'publicWeb.broadcastStatus.note':
    'I risultati si aggiornano automaticamente quando c’è connessione. Altrimenti, questa pagina contiene già tutto.',

  'publicWeb.ticker.heading': 'Partite',
  'publicWeb.ticker.empty': 'Nessuna partita ancora programmata.',

  'publicWeb.series.ariaLabel': 'Serie al meglio delle {bestOf}: {home} a {away}',

  'publicWeb.live.usingLastKnown': 'Visualizzazione dell’ultimo stato conosciuto.',

  'publicWeb.tournamentPage.description': 'Risultati, classifica e regolamento di {tournament}.',

  'publicWeb.livePage.title': 'In diretta',
  'publicWeb.livePage.seriesHeading': 'Serie',
  'publicWeb.livePage.upcomingHeading': 'Prossime',
  'publicWeb.livePage.leadersHeading': 'Leader',

  'publicWeb.bracketPage.title': 'Tabellone',
};
