/**
 * Portuguese translations, keyed to match `public-messages.en.ts`'s IDs
 * exactly. Best-effort translation; native-speaker review is a later
 * pass (owner's explicit choice, 0051).
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

  'publicWeb.hero.liveCount': '{count} AO VIVO',
  'publicWeb.hero.noLiveMatches': 'NENHUMA PARTIDA AO VIVO',

  'publicWeb.bracket.roundAriaLabel': '{branch} — rodada {round}',
  'publicWeb.bracket.roundHeading': 'Rodada {round}',

  'publicWeb.broadcastStatus.note':
    'Os resultados são atualizados automaticamente quando há conexão. Caso contrário, esta página já traz tudo.',

  'publicWeb.ticker.heading': 'Partidas',
  'publicWeb.ticker.empty': 'Ainda não há partidas programadas.',

  'publicWeb.series.ariaLabel': 'Série melhor de {bestOf}: {home} a {away}',

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
};
