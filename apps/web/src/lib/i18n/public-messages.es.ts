/**
 * Spanish translations, keyed to match `public-messages.en.ts`'s IDs exactly
 *. Reproduces today's pre-extraction wording so the `/es/` variant
 * reads exactly as the site did before this change.
 */
export const messages: Record<string, string> = {
  'publicWeb.layout.skipToContent': 'Saltar al contenido',
  'publicWeb.layout.navAriaLabel': 'Principal',
  'publicWeb.layout.footer': 'Publicado con CopaLibre — AGPL-3.0',

  'publicWeb.resultState.live': 'EN VIVO',
  'publicWeb.resultState.upcoming': 'PROGRAMADO',
  'publicWeb.resultState.final': 'FINAL',
  'publicWeb.resultState.disputed': 'EN DISPUTA',
  'publicWeb.resultState.winner': 'GANÓ',
  'publicWeb.resultState.loser': 'PERDIÓ',
  'publicWeb.resultState.tbd': 'A DEFINIR',
  'publicWeb.resultState.cancelled': 'CANCELADO',

  'publicWeb.resultReason.administrativeLoss': 'DERROTA ADM.',
  'publicWeb.resultReason.walkover': 'W/O',
  'publicWeb.resultReason.forfeitAbandonment': 'ABANDONO',
  'publicWeb.resultReason.disqualified': 'DESCALIFICADO',
  'publicWeb.resultReason.didNotFinish': 'NO TERMINÓ',

  'publicWeb.legend.heading': 'Referencias',

  'publicWeb.ruleset.heading': 'Reglamento',

  'publicWeb.standings.heading': 'Posiciones',
  'publicWeb.standings.empty': 'Las posiciones aparecen cuando se juega el primer partido.',
  'publicWeb.standings.team': 'Equipo',
  'publicWeb.standings.played': 'PJ',
  'publicWeb.standings.points': 'Pts',

  'publicWeb.hero.liveCount': '{count} EN VIVO',
  'publicWeb.hero.noLiveMatches': 'SIN PARTIDOS EN VIVO',

  'publicWeb.bracket.roundAriaLabel': '{branch} — ronda {round}',
  'publicWeb.bracket.roundHeading': 'Ronda {round}',

  'publicWeb.broadcastStatus.note':
    'Los resultados se actualizan solos cuando hay conexión. Si no, esta página ya trae todo.',

  'publicWeb.ticker.heading': 'Partidos',
  'publicWeb.ticker.empty': 'Todavía no hay partidos programados.',

  'publicWeb.series.ariaLabel': 'Serie al mejor de {bestOf}: {home} a {away}',

  'publicWeb.live.usingLastKnown': 'Mostrando el último estado conocido.',

  'publicWeb.tournamentPage.description': 'Resultados, posiciones y reglamento de {tournament}.',

  'publicWeb.livePage.title': 'En vivo',
  'publicWeb.livePage.seriesHeading': 'Serie',
  'publicWeb.livePage.upcomingHeading': 'Próximos',
  'publicWeb.livePage.leadersHeading': 'Líderes',

  'publicWeb.bracketPage.title': 'Llave',

  'publicWeb.playerProfile.heading': 'Perfil del Jugador',
  'publicWeb.playerProfile.age': 'Edad: {age}',
  'publicWeb.playerProfile.nationality': 'Nacionalidad: {country}',
  'publicWeb.playerProfile.historyHeading': 'Historial de Competiciones',
  'publicWeb.playerProfile.careerStatsHeading': 'Estadísticas de Carrera',
  'publicWeb.playerProfile.noHistory': 'No hay historial de competiciones registrado.',
  'publicWeb.playerProfile.noStats': 'No hay estadísticas de carrera registradas.',
  'publicWeb.playerProfile.close': 'Cerrar',
};
