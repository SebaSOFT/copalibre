/**
 * Mandarin Chinese translations, keyed to match `public-messages.en.ts`'s IDs
 * exactly. Best-effort machine-quality translation (owner's explicit
 * choice): ship now, native-speaker review later.
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
  'publicWeb.series.gameWonHome': '第 {number} 场：主队获胜',
  'publicWeb.series.gameWonAway': '第 {number} 场：客队获胜',
  'publicWeb.series.gameCurrent': '第 {number} 场：进行中',
  'publicWeb.series.gameUpcoming': '第 {number} 场：尚未进行',
  'publicWeb.series.gameNotRequired': '第 {number} 场：不会进行',
  'publicWeb.series.pending': '系列赛未分胜负，{home}–{away}',
  'publicWeb.series.decided': '{winner} 赢得系列赛',
  'publicWeb.series.aggregate': '两回合总比分 {home}–{away}',

  'publicWeb.live.usingLastKnown': '正在显示最后已知状态。',

  'publicWeb.tournamentPage.description': '{tournament} 的结果、排名和规则。',

  'publicWeb.livePage.title': '实时',
  'publicWeb.livePage.seriesHeading': '系列赛',
  'publicWeb.livePage.upcomingHeading': '即将开始',
  'publicWeb.livePage.leadersHeading': '领先者',

  'publicWeb.bracketPage.title': '对阵表',

  'publicWeb.playerProfile.heading': '球员档案',
  'publicWeb.playerProfile.age': '年龄: {age}',
  'publicWeb.playerProfile.nationality': '国籍: {country}',
  'publicWeb.playerProfile.historyHeading': '参赛历史',
  'publicWeb.playerProfile.careerStatsHeading': '生涯数据',
  'publicWeb.playerProfile.noHistory': '暂无参赛历史记录。',
  'publicWeb.playerProfile.noStats': '暂无生涯数据记录。',
  'publicWeb.playerProfile.close': '关闭',
  'publicWeb.playerProfile.photoAlt': '{name}',
  'publicWeb.playerProfile.photoPlaceholderAlt': '未上传照片',

  'publicWeb.tournamentsPage.title': '赛事列表',
  'publicWeb.tournamentsPage.liveHeading': '正在进行与活跃赛事',
  'publicWeb.tournamentsPage.upcomingHeading': '即将开始',
  'publicWeb.tournamentsPage.finishedHeading': '已完赛与归档',
  'publicWeb.tournamentsPage.empty': '未找到已发布的赛事。',
  'publicWeb.tournamentsPage.champion': '冠军',
  'publicWeb.tournamentsPage.runnerUp': '亚军',
  'publicWeb.tournamentsPage.viewDetails': '查看赛事',
  'publicWeb.orgPage.featuredHeading': '精选',
  'publicWeb.orgPage.clubsHeading': '俱乐部',
  'publicWeb.orgPage.noClubs': '尚未注册任何俱乐部。',
  'publicWeb.orgPage.emblemAlt': '{name}的徽章',
  'publicWeb.orgPage.emblemPlaceholderAlt': '未上传徽章',
  'publicWeb.orgPage.notFoundTitle': '未找到组织',
  'publicWeb.orgPage.notFoundBody': '该地址不存在任何组织。',
};
