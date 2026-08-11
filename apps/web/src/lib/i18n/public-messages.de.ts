/**
 * German translations, keyed to match `public-messages.en.ts`'s IDs exactly
 * (0056). Best-effort translation; native-speaker review is a later pass
 * (owner's explicit choice, 0051).
 */
export const messages: Record<string, string> = {
  'publicWeb.layout.skipToContent': 'Zum Inhalt springen',
  'publicWeb.layout.navAriaLabel': 'Hauptnavigation',
  'publicWeb.layout.footer': 'Veröffentlicht mit CopaLibre — AGPL-3.0',

  'publicWeb.resultState.live': 'LIVE',
  'publicWeb.resultState.upcoming': 'GEPLANT',
  'publicWeb.resultState.final': 'ENDSTAND',
  'publicWeb.resultState.disputed': 'STRITTIG',
  'publicWeb.resultState.winner': 'GEWONNEN',
  'publicWeb.resultState.loser': 'VERLOREN',
  'publicWeb.resultState.tbd': 'OFFEN',
  'publicWeb.resultState.cancelled': 'ABGESAGT',

  'publicWeb.legend.heading': 'Legende',

  'publicWeb.ruleset.heading': 'Reglement',

  'publicWeb.standings.heading': 'Tabelle',
  'publicWeb.standings.empty': 'Die Tabelle erscheint, sobald das erste Spiel ausgetragen ist.',
  'publicWeb.standings.team': 'Team',
  'publicWeb.standings.played': 'Sp.',
  'publicWeb.standings.points': 'Pkt.',

  'publicWeb.hero.liveCount': '{count} LIVE',
  'publicWeb.hero.noLiveMatches': 'KEINE LIVE-SPIELE',

  'publicWeb.bracket.roundAriaLabel': '{branch} — Runde {round}',
  'publicWeb.bracket.roundHeading': 'Runde {round}',

  'publicWeb.broadcastStatus.note':
    'Ergebnisse aktualisieren sich automatisch bei bestehender Verbindung. Andernfalls enthält diese Seite bereits alles.',

  'publicWeb.ticker.heading': 'Spiele',
  'publicWeb.ticker.empty': 'Noch keine Spiele angesetzt.',

  'publicWeb.series.ariaLabel': 'Serie im Modus Best-of-{bestOf}: {home} zu {away}',

  'publicWeb.live.usingLastKnown': 'Letzter bekannter Stand wird angezeigt.',

  'publicWeb.tournamentPage.description': 'Ergebnisse, Tabelle und Reglement für {tournament}.',

  'publicWeb.livePage.title': 'Live',
  'publicWeb.livePage.seriesHeading': 'Serie',
  'publicWeb.livePage.upcomingHeading': 'Bevorstehend',
  'publicWeb.livePage.leadersHeading': 'Spitzenreiter',

  'publicWeb.bracketPage.title': 'Turnierbaum',
};
