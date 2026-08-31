/**
 * Portuguese translations, keyed to match `public-messages.en.ts`'s IDs
 * exactly. Best-effort translation; native-speaker review is a later
 * pass (owner's explicit choice).
 */
export const messages: Record<string, string> = {
  'publicWeb.layout.skipToContent': 'Pular para o conteúdo',
  'publicWeb.layout.navAriaLabel': 'Principal',
  'publicWeb.layout.footer': 'Publicado com CopaLibre — AGPL-3.0',

  'publicWeb.resultState.live': 'AO VIVO',
  'publicWeb.resultState.upcoming': 'PROGRAMADO',
  'publicWeb.resultState.final': 'FINAL',
  'publicWeb.resultState.disputed': 'EM DISPUTA',
  'publicWeb.resultState.winner': 'VENCEU',
  'publicWeb.resultState.loser': 'PERDEU',
  'publicWeb.resultState.tbd': 'A DEFINIR',
  'publicWeb.resultState.cancelled': 'CANCELADO',

  'publicWeb.resultReason.administrativeLoss': 'DERROTA ADM.',
  'publicWeb.resultReason.walkover': 'W/O',
  'publicWeb.resultReason.forfeitAbandonment': 'ABANDONO',
  'publicWeb.resultReason.disqualified': 'DESCLASSIFICADO',
  'publicWeb.resultReason.didNotFinish': 'NÃO TERMINOU',

  'publicWeb.legend.heading': 'Legenda',

  'publicWeb.ruleset.heading': 'Regulamento',

  'publicWeb.standings.heading': 'Classificação',
  'publicWeb.standings.empty': 'A classificação aparece quando a primeira partida é disputada.',
  'publicWeb.standings.team': 'Equipe',
  'publicWeb.standings.played': 'PJ',
  'publicWeb.standings.points': 'Pts',
  'publicWeb.standings.grain.series': 'Esta tabela conta um resultado por série.',
  'publicWeb.standings.grain.match': 'Esta tabela conta um resultado por partida disputada.',
  'publicWeb.standings.column.series.label': 'Séries',
  'publicWeb.standings.column.series.shortLabel': 'S',

  'publicWeb.hero.liveCount': '{count} AO VIVO',
  'publicWeb.hero.noLiveMatches': 'NENHUMA PARTIDA AO VIVO',

  'publicWeb.bracket.roundAriaLabel': '{branch} — rodada {round}',
  'publicWeb.bracket.roundHeading': 'Rodada {round}',

  'publicWeb.broadcastStatus.note':
    'Os resultados são atualizados automaticamente quando há conexão. Caso contrário, esta página já traz tudo.',

  'publicWeb.ticker.heading': 'Partidas',
  'publicWeb.ticker.empty': 'Ainda não há partidas programadas.',

  'publicWeb.series.ariaLabel': 'Série melhor de {bestOf}: {home} a {away}',
  'publicWeb.series.gameWonHome': 'Jogo {number}: vencido pelo mandante',
  'publicWeb.series.gameWonAway': 'Jogo {number}: vencido pelo visitante',
  'publicWeb.series.gameCurrent': 'Jogo {number}: em andamento',
  'publicWeb.series.gameUpcoming': 'Jogo {number}: ainda a disputar',
  'publicWeb.series.gameNotRequired': 'Jogo {number}: não será disputado',
  'publicWeb.series.pending': 'Série indefinida em {home}–{away}',
  'publicWeb.series.decided': '{winner} venceu a série',
  'publicWeb.series.aggregate': 'No agregado {home}–{away}',

  'publicWeb.live.usingLastKnown': 'Mostrando o último estado conhecido.',

  'publicWeb.tournamentPage.description':
    'Resultados, classificação e regulamento de {tournament}.',

  'publicWeb.livePage.title': 'Ao vivo',
  'publicWeb.livePage.seriesHeading': 'Série',
  'publicWeb.livePage.upcomingHeading': 'Próximas',
  'publicWeb.livePage.leadersHeading': 'Líderes',

  'publicWeb.bracketPage.title': 'Chave',

  'publicWeb.playerProfile.heading': 'Perfil do Jogador',
  'publicWeb.playerProfile.age': 'Idade: {age}',
  'publicWeb.playerProfile.nationality': 'Nacionalidade: {country}',
  'publicWeb.playerProfile.historyHeading': 'Histórico de Competições',
  'publicWeb.playerProfile.careerStatsHeading': 'Estatísticas da Carreira',
  'publicWeb.playerProfile.noHistory': 'Nenhum histórico de competições registrado.',
  'publicWeb.playerProfile.noStats': 'Nenhuma estatística da carreira registrada.',
  'publicWeb.playerProfile.close': 'Fechar',
  'publicWeb.playerProfile.photoAlt': '{name}',
  'publicWeb.playerProfile.photoPlaceholderAlt': 'Nenhuma foto enviada',

  'publicWeb.tournamentsPage.title': 'Torneios',
  'publicWeb.tournamentsPage.liveHeading': 'Ao Vivo e Ativos',
  'publicWeb.tournamentsPage.upcomingHeading': 'Próximos',
  'publicWeb.tournamentsPage.finishedHeading': 'Encerrados e Arquivo',
  'publicWeb.tournamentsPage.empty': 'Nenhum torneio publicado encontrado.',
  'publicWeb.tournamentsPage.champion': 'Campeão',
  'publicWeb.tournamentsPage.runnerUp': 'Vice-campeão',
  'publicWeb.tournamentsPage.viewDetails': 'Ver torneio',
  'publicWeb.orgPage.featuredHeading': 'Destaque',
  'publicWeb.orgPage.clubsHeading': 'Clubes',
  'publicWeb.orgPage.noClubs': 'Ainda não há clubes registrados.',
  'publicWeb.orgPage.emblemAlt': 'Escudo de {name}',
  'publicWeb.orgPage.emblemPlaceholderAlt': 'Nenhum escudo enviado',
  'publicWeb.orgPage.notFoundTitle': 'Organização não encontrada',
  'publicWeb.orgPage.notFoundBody': 'Não existe nenhuma organização neste endereço.',

  'publicWeb.matchesView.pageTitle': 'Partidas',
  'publicWeb.matchesView.filterAll': 'Todas',
  'publicWeb.matchesView.filterLive': 'Ao vivo',
  'publicWeb.matchesView.filterUpcoming': 'Próximas',
  'publicWeb.matchesView.filterFinal': 'Finalizadas',
  'publicWeb.matchesView.empty': 'Ainda não há partidas neste escopo.',
  'publicWeb.matchesView.clockAriaLabel': 'Tempo decorrido: {time}',
  'publicWeb.matchesView.venueAriaLabel': 'Local: {venue}',
  'publicWeb.matchesView.latestEventAriaLabel': 'Último evento: {event}',
  'publicWeb.matchesView.zoneGroupAriaLabel': 'Zona/grupo: {scope}',
  'publicWeb.matchesView.positionInGroup': '{group} — posição nº {position}',
  'publicWeb.matchesView.position': 'Posição nº {position}',
  'publicWeb.matchesView.decidedBy': 'Decidido por: {factor}',
  'publicWeb.matchesView.decidedByAriaLabel':
    'O fator decisivo entre posições empatadas. Um organizador autorizado pode ver a explicação completa no painel de controle.',
  'publicWeb.matchesView.fullTraceHeading': 'Rastro completo do comparador de classificação',
  'publicWeb.matchesView.seeAll': 'Ver todas as partidas',
};
