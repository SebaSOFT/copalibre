/**
 * Italian translations, keyed to match `public-messages.en.ts`'s IDs exactly
 *. Best-effort translation; native-speaker review is a later pass
 * (owner's explicit choice).
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

  'publicWeb.resultReason.administrativeLoss': 'SCONFITTA AMM.',
  'publicWeb.resultReason.walkover': 'W/O',
  'publicWeb.resultReason.forfeitAbandonment': 'RITIRO',
  'publicWeb.resultReason.disqualified': 'SQUALIFICATO',
  'publicWeb.resultReason.didNotFinish': 'NON COMPLETATO',

  'publicWeb.legend.heading': 'Legenda',

  'publicWeb.ruleset.heading': 'Regolamento',

  'publicWeb.standings.heading': 'Classifica',
  'publicWeb.standings.empty': 'La classifica appare dopo la prima partita giocata.',
  'publicWeb.standings.team': 'Squadra',
  'publicWeb.standings.played': 'PG',
  'publicWeb.standings.points': 'Pti',
  'publicWeb.standings.grain.series': 'Questa tabella conta un risultato per serie.',
  'publicWeb.standings.grain.match': 'Questa tabella conta un risultato per partita giocata.',
  'publicWeb.standings.column.series.label': 'Serie',
  'publicWeb.standings.column.series.shortLabel': 'S',

  'publicWeb.hero.liveCount': '{count} IN DIRETTA',
  'publicWeb.hero.noLiveMatches': 'NESSUNA PARTITA IN DIRETTA',
  'publicWeb.hero.tournamentEmblemAlt': 'Stemma di {name}',
  'publicWeb.hero.tournamentEmblemPlaceholderAlt': 'Nessuno stemma del torneo caricato',

  'publicWeb.bracket.roundAriaLabel': '{branch} — turno {round}',
  'publicWeb.bracket.roundHeading': 'Turno {round}',

  'publicWeb.broadcastStatus.note':
    'I risultati si aggiornano automaticamente quando c’è connessione. Altrimenti, questa pagina contiene già tutto.',

  'publicWeb.ticker.heading': 'Partite',
  'publicWeb.ticker.empty': 'Nessuna partita ancora programmata.',

  'publicWeb.series.ariaLabel': 'Serie al meglio delle {bestOf}: {home} a {away}',
  'publicWeb.series.gameWonHome': 'Partita {number}: vinta dai padroni di casa',
  'publicWeb.series.gameWonAway': 'Partita {number}: vinta dagli ospiti',
  'publicWeb.series.gameCurrent': 'Partita {number}: in corso',
  'publicWeb.series.gameUpcoming': 'Partita {number}: ancora da giocare',
  'publicWeb.series.gameNotRequired': 'Partita {number}: non si giocherà',
  'publicWeb.series.pending': 'Serie aperta sul {home}–{away}',
  'publicWeb.series.decided': '{winner} ha vinto la serie',
  'publicWeb.series.aggregate': 'Nel complesso {home}–{away}',

  'publicWeb.live.usingLastKnown': 'Visualizzazione dell’ultimo stato conosciuto.',

  'publicWeb.tournamentPage.description': 'Risultati, classifica e regolamento di {tournament}.',

  'publicWeb.livePage.title': 'In diretta',
  'publicWeb.livePage.seriesHeading': 'Serie',
  'publicWeb.livePage.upcomingHeading': 'Prossime',
  'publicWeb.livePage.leadersHeading': 'Leader',

  'publicWeb.bracketPage.title': 'Tabellone',

  'publicWeb.playerProfile.heading': 'Profilo Giocatore',
  'publicWeb.playerProfile.age': 'Età: {age}',
  'publicWeb.playerProfile.nationality': 'Nazionalità: {country}',
  'publicWeb.playerProfile.historyHeading': 'Storico Competizioni',
  'publicWeb.playerProfile.careerStatsHeading': 'Statistiche in Carriera',
  'publicWeb.playerProfile.noHistory': 'Nessun storico competizioni registrato.',
  'publicWeb.playerProfile.noStats': 'Nessuna statistica in carriera registrata.',
  'publicWeb.playerProfile.close': 'Chiudi',
  'publicWeb.playerProfile.photoAlt': '{name}',
  'publicWeb.playerProfile.photoPlaceholderAlt': 'Nessuna foto caricata',

  'publicWeb.tournamentsPage.title': 'Tornei',
  'publicWeb.tournamentsPage.liveHeading': 'Dal vivo e attivi',
  'publicWeb.tournamentsPage.upcomingHeading': 'In arrivo',
  'publicWeb.tournamentsPage.finishedHeading': 'Conclusi e archivio',
  'publicWeb.tournamentsPage.empty': 'Nessun torneo pubblicato trovato.',
  'publicWeb.tournamentsPage.champion': 'Campione',
  'publicWeb.tournamentsPage.runnerUp': 'Secondo classificato',
  'publicWeb.tournamentsPage.viewDetails': 'Visualizza torneo',
  'publicWeb.orgPage.featuredHeading': 'In evidenza',
  'publicWeb.orgPage.clubsHeading': 'Club',
  'publicWeb.orgPage.noClubs': 'Nessun club registrato ancora.',
  'publicWeb.orgPage.emblemAlt': 'Stemma di {name}',
  'publicWeb.orgPage.emblemPlaceholderAlt': 'Nessuno stemma caricato',
  'publicWeb.orgPage.notFoundTitle': 'Organizzazione non trovata',
  'publicWeb.orgPage.notFoundBody': 'Non esiste alcuna organizzazione a questo indirizzo.',

  'publicWeb.matchesView.pageTitle': 'Partite',
  'publicWeb.matchesView.filterAll': 'Tutte',
  'publicWeb.matchesView.filterLive': 'In diretta',
  'publicWeb.matchesView.filterUpcoming': 'In programma',
  'publicWeb.matchesView.filterFinal': 'Concluse',
  'publicWeb.matchesView.empty': 'Ancora nessuna partita in questo ambito.',
  'publicWeb.matchesView.clockAriaLabel': 'Tempo trascorso: {time}',
  'publicWeb.matchesView.venueAriaLabel': 'Sede: {venue}',
  'publicWeb.matchesView.latestEventAriaLabel': 'Ultimo evento: {event}',
  'publicWeb.matchesView.zoneGroupAriaLabel': 'Zona/girone: {scope}',
  'publicWeb.matchesView.positionInGroup': '{group} — posizione n. {position}',
  'publicWeb.matchesView.position': 'Posizione n. {position}',
  'publicWeb.matchesView.decidedBy': 'Deciso da: {factor}',
  'publicWeb.matchesView.decidedByAriaLabel':
    'Il fattore decisivo tra posizioni in classifica a pari merito. Un organizzatore autorizzato può vedere la spiegazione completa nel pannello di controllo.',
  'publicWeb.matchesView.fullTraceHeading': 'Traccia completa del comparatore di classifica',
  'publicWeb.matchesView.seeAll': 'Vedi tutte le partite',

  'publicWeb.notFound.pageTitle': 'Pagina non trovata — CopaLibre',
  'publicWeb.notFound.heading': 'Pagina non trovata',
  'publicWeb.notFound.body': 'Nessun contenuto esiste a questo indirizzo.',
  'publicWeb.notFound.homeLink': 'Torna alla home',
};
