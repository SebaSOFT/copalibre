/**
 * Russian translations, keyed to match `public-messages.en.ts`'s IDs exactly
 *. Best-effort translation; native-speaker review is a later pass
 * (owner's explicit choice, 0051).
 */
export const messages: Record<string, string> = {
  'publicWeb.layout.skipToContent': 'Перейти к содержимому',
  'publicWeb.layout.navAriaLabel': 'Основная навигация',
  'publicWeb.layout.footer': 'Опубликовано с CopaLibre — AGPL-3.0',

  'publicWeb.resultState.live': 'В ЭФИРЕ',
  'publicWeb.resultState.upcoming': 'ЗАПЛАНИРОВАНО',
  'publicWeb.resultState.final': 'ИТОГ',
  'publicWeb.resultState.disputed': 'ОСПАРИВАЕТСЯ',
  'publicWeb.resultState.winner': 'ПОБЕДА',
  'publicWeb.resultState.loser': 'ПОРАЖЕНИЕ',
  'publicWeb.resultState.tbd': 'УТОЧНЯЕТСЯ',
  'publicWeb.resultState.cancelled': 'ОТМЕНЕНО',

  'publicWeb.resultReason.administrativeLoss': 'ТЕХ. ПОРАЖЕНИЕ',
  'publicWeb.resultReason.walkover': 'НЕЯВКА',
  'publicWeb.resultReason.forfeitAbandonment': 'СНЯТИЕ',
  'publicWeb.resultReason.disqualified': 'ДИСКВАЛИФИЦИРОВАН',
  'publicWeb.resultReason.didNotFinish': 'НЕ ФИНИШИРОВАЛ',

  'publicWeb.legend.heading': 'Легенда',

  'publicWeb.ruleset.heading': 'Регламент',

  'publicWeb.standings.heading': 'Турнирная таблица',
  'publicWeb.standings.empty': 'Таблица появится после первого сыгранного матча.',
  'publicWeb.standings.team': 'Команда',
  'publicWeb.standings.played': 'И',
  'publicWeb.standings.points': 'Очки',

  'publicWeb.hero.liveCount': '{count} В ЭФИРЕ',
  'publicWeb.hero.noLiveMatches': 'НЕТ МАТЧЕЙ В ЭФИРЕ',

  'publicWeb.bracket.roundAriaLabel': '{branch} — раунд {round}',
  'publicWeb.bracket.roundHeading': 'Раунд {round}',

  'publicWeb.broadcastStatus.note':
    'Результаты обновляются автоматически при наличии соединения. В противном случае на этой странице уже есть все данные.',

  'publicWeb.ticker.heading': 'Матчи',
  'publicWeb.ticker.empty': 'Пока нет запланированных матчей.',

  'publicWeb.series.ariaLabel': 'Серия до {bestOf} побед: {home} — {away}',

  'publicWeb.live.usingLastKnown': 'Отображается последнее известное состояние.',

  'publicWeb.tournamentPage.description': 'Результаты, турнирная таблица и регламент {tournament}.',

  'publicWeb.livePage.title': 'В эфире',
  'publicWeb.livePage.seriesHeading': 'Серия',
  'publicWeb.livePage.upcomingHeading': 'Предстоящие',
  'publicWeb.livePage.leadersHeading': 'Лидеры',

  'publicWeb.bracketPage.title': 'Сетка',
};
