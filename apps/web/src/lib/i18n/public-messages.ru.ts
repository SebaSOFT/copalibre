/**
 * Russian translations, keyed to match `public-messages.en.ts`'s IDs exactly
 *. Best-effort translation; native-speaker review is a later pass
 * (owner's explicit choice).
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
  'publicWeb.standings.grain.series': 'Эта таблица засчитывает один результат за серию.',
  'publicWeb.standings.grain.match': 'Эта таблица засчитывает один результат за сыгранный матч.',
  'publicWeb.standings.column.series.label': 'Серии',
  'publicWeb.standings.column.series.shortLabel': 'С',

  'publicWeb.hero.liveCount': '{count} В ЭФИРЕ',
  'publicWeb.hero.noLiveMatches': 'НЕТ МАТЧЕЙ В ЭФИРЕ',

  'publicWeb.bracket.roundAriaLabel': '{branch} — раунд {round}',
  'publicWeb.bracket.roundHeading': 'Раунд {round}',

  'publicWeb.broadcastStatus.note':
    'Результаты обновляются автоматически при наличии соединения. В противном случае на этой странице уже есть все данные.',

  'publicWeb.ticker.heading': 'Матчи',
  'publicWeb.ticker.empty': 'Пока нет запланированных матчей.',

  'publicWeb.series.ariaLabel': 'Серия до {bestOf} побед: {home} — {away}',
  'publicWeb.series.gameWonHome': 'Матч {number}: выиграл хозяин',
  'publicWeb.series.gameWonAway': 'Матч {number}: выиграл гость',
  'publicWeb.series.gameCurrent': 'Матч {number}: идёт',
  'publicWeb.series.gameUpcoming': 'Матч {number}: ещё предстоит',
  'publicWeb.series.gameNotRequired': 'Матч {number}: не будет сыгран',
  'publicWeb.series.pending': 'Серия не решена при {home}–{away}',
  'publicWeb.series.decided': '{winner} выиграл серию',
  'publicWeb.series.aggregate': 'По сумме {home}–{away}',

  'publicWeb.live.usingLastKnown': 'Отображается последнее известное состояние.',

  'publicWeb.tournamentPage.description': 'Результаты, турнирная таблица и регламент {tournament}.',

  'publicWeb.livePage.title': 'В эфире',
  'publicWeb.livePage.seriesHeading': 'Серия',
  'publicWeb.livePage.upcomingHeading': 'Предстоящие',
  'publicWeb.livePage.leadersHeading': 'Лидеры',

  'publicWeb.bracketPage.title': 'Сетка',

  'publicWeb.playerProfile.heading': 'Профиль игрока',
  'publicWeb.playerProfile.age': 'Возраст: {age}',
  'publicWeb.playerProfile.nationality': 'Гражданство: {country}',
  'publicWeb.playerProfile.historyHeading': 'История соревнований',
  'publicWeb.playerProfile.careerStatsHeading': 'Статистика за карьеру',
  'publicWeb.playerProfile.noHistory': 'История соревнований отсутствует.',
  'publicWeb.playerProfile.noStats': 'Статистика за карьеру отсутствует.',
  'publicWeb.playerProfile.close': 'Закрыть',
  'publicWeb.playerProfile.photoAlt': '{name}',
  'publicWeb.playerProfile.photoPlaceholderAlt': 'Фото не загружено',

  'publicWeb.tournamentsPage.title': 'Турниры',
  'publicWeb.tournamentsPage.liveHeading': 'В прямом эфире и активные',
  'publicWeb.tournamentsPage.upcomingHeading': 'Предстоящие',
  'publicWeb.tournamentsPage.finishedHeading': 'Завершенные и архив',
  'publicWeb.tournamentsPage.empty': 'Опубликованных турниров не найдено.',
  'publicWeb.tournamentsPage.champion': 'Чемпион',
  'publicWeb.tournamentsPage.runnerUp': 'Финалист',
  'publicWeb.tournamentsPage.viewDetails': 'Смотреть турнир',
  'publicWeb.orgPage.featuredHeading': 'Рекомендуем',
  'publicWeb.orgPage.clubsHeading': 'Клубы',
  'publicWeb.orgPage.noClubs': 'Клубы пока не зарегистрированы.',
  'publicWeb.orgPage.emblemAlt': 'Эмблема {name}',
  'publicWeb.orgPage.emblemPlaceholderAlt': 'Эмблема не загружена',
  'publicWeb.orgPage.notFoundTitle': 'Организация не найдена',
  'publicWeb.orgPage.notFoundBody': 'По этому адресу организация не найдена.',

  'publicWeb.matchesView.pageTitle': 'Матчи',
  'publicWeb.matchesView.filterAll': 'Все',
  'publicWeb.matchesView.filterLive': 'В эфире',
  'publicWeb.matchesView.filterUpcoming': 'Предстоящие',
  'publicWeb.matchesView.filterFinal': 'Завершённые',
  'publicWeb.matchesView.empty': 'В этой области пока нет матчей.',
  'publicWeb.matchesView.clockAriaLabel': 'Прошло времени: {time}',
  'publicWeb.matchesView.venueAriaLabel': 'Площадка: {venue}',
  'publicWeb.matchesView.latestEventAriaLabel': 'Последнее событие: {event}',
  'publicWeb.matchesView.zoneGroupAriaLabel': 'Зона/группа: {scope}',
  'publicWeb.matchesView.positionInGroup': '{group} — позиция №{position}',
  'publicWeb.matchesView.position': 'Позиция №{position}',
  'publicWeb.matchesView.decidedBy': 'Решено по: {factor}',
  'publicWeb.matchesView.decidedByAriaLabel':
    'Решающий фактор между позициями с равными показателями. Полное объяснение доступно уполномоченному организатору в панели управления.',
  'publicWeb.matchesView.fullTraceHeading': 'Полная трассировка компаратора турнирной таблицы',
  'publicWeb.matchesView.seeAll': 'Смотреть все матчи',

  'publicWeb.notFound.pageTitle': 'Страница не найдена — CopaLibre',
  'publicWeb.notFound.heading': 'Страница не найдена',
  'publicWeb.notFound.body': 'По этому адресу ничего не найдено.',
  'publicWeb.notFound.homeLink': 'На главную',
};
