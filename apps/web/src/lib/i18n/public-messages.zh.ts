/**
 * Mandarin Chinese translations, keyed to match `public-messages.en.ts`'s IDs
 * exactly (0057). Best-effort machine-quality translation (owner's explicit
 * choice, 0051): ship now, native-speaker review later.
 */
export const messages: Record<string, string> = {
  'publicWeb.layout.skipToContent': '跳至内容',
  'publicWeb.layout.navAriaLabel': '主导航',
  'publicWeb.layout.footer': '由 CopaLibre 发布 — AGPL-3.0',

  'publicWeb.resultState.live': '进行中',
  'publicWeb.resultState.upcoming': '即将开始',
  'publicWeb.resultState.final': '已结束',
  'publicWeb.resultState.disputed': '存在争议',
  'publicWeb.resultState.winner': '获胜',
  'publicWeb.resultState.loser': '落败',
  'publicWeb.resultState.tbd': '待定',
  'publicWeb.resultState.cancelled': '已取消',

  'publicWeb.resultReason.administrativeLoss': '判负',
  'publicWeb.resultReason.walkover': '弃权',
  'publicWeb.resultReason.forfeitAbandonment': '中途退赛',
  'publicWeb.resultReason.disqualified': '取消资格',
  'publicWeb.resultReason.didNotFinish': '未完成',

  'publicWeb.legend.heading': '图例',

  'publicWeb.ruleset.heading': '规则',

  'publicWeb.standings.heading': '排名',
  'publicWeb.standings.empty': '排名将在首场比赛结束后显示。',
  'publicWeb.standings.team': '队伍',
  'publicWeb.standings.played': '场次',
  'publicWeb.standings.points': '积分',

  'publicWeb.hero.liveCount': '{count} 场进行中',
  'publicWeb.hero.noLiveMatches': '当前没有进行中的比赛',

  'publicWeb.bracket.roundAriaLabel': '{branch} — 第 {round} 轮',
  'publicWeb.bracket.roundHeading': '第 {round} 轮',

  'publicWeb.broadcastStatus.note': '连接正常时结果会自动更新。若未连接，本页面已包含所有信息。',

  'publicWeb.ticker.heading': '比赛',
  'publicWeb.ticker.empty': '暂无已安排的比赛。',

  'publicWeb.series.ariaLabel': '{bestOf} 局系列赛：{home} 比 {away}',

  'publicWeb.live.usingLastKnown': '正在显示最后已知状态。',

  'publicWeb.tournamentPage.description': '{tournament} 的结果、排名和规则。',

  'publicWeb.livePage.title': '实时',
  'publicWeb.livePage.seriesHeading': '系列赛',
  'publicWeb.livePage.upcomingHeading': '即将开始',
  'publicWeb.livePage.leadersHeading': '领先者',

  'publicWeb.bracketPage.title': '对阵表',
};
