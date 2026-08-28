/**
 * German translations, keyed to match `public-messages.en.ts`'s IDs exactly
 *. Best-effort translation; native-speaker review is a later pass
 * (owner's explicit choice).
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

  'publicWeb.resultReason.administrativeLoss': 'ADM. NIEDERLAGE',
  'publicWeb.resultReason.walkover': 'W/O',
  'publicWeb.resultReason.forfeitAbandonment': 'AUFGABE',
  'publicWeb.resultReason.disqualified': 'DISQUALIFIZIERT',
  'publicWeb.resultReason.didNotFinish': 'NICHT BEENDET',

  'publicWeb.legend.heading': 'Legende',

  'publicWeb.ruleset.heading': 'Reglement',

  'publicWeb.standings.heading': 'Tabelle',
  'publicWeb.standings.empty': 'Die Tabelle erscheint, sobald das erste Spiel ausgetragen ist.',
  'publicWeb.standings.team': 'Team',
  'publicWeb.standings.played': 'Sp.',
  'publicWeb.standings.points': 'Pkt.',
  'publicWeb.standings.grain.series': 'Diese Tabelle zählt ein Ergebnis pro Serie.',
  'publicWeb.standings.grain.match': 'Diese Tabelle zählt ein Ergebnis pro gespieltem Spiel.',
  'publicWeb.standings.column.series.label': 'Serien',
  'publicWeb.standings.column.series.shortLabel': 'S',

  'publicWeb.hero.liveCount': '{count} LIVE',
  'publicWeb.hero.noLiveMatches': 'KEINE LIVE-SPIELE',

  'publicWeb.bracket.roundAriaLabel': '{branch} — Runde {round}',
  'publicWeb.bracket.roundHeading': 'Runde {round}',

  'publicWeb.broadcastStatus.note':
    'Ergebnisse aktualisieren sich automatisch bei bestehender Verbindung. Andernfalls enthält diese Seite bereits alles.',

  'publicWeb.ticker.heading': 'Spiele',
  'publicWeb.ticker.empty': 'Noch keine Spiele angesetzt.',

  'publicWeb.series.ariaLabel': 'Serie im Modus Best-of-{bestOf}: {home} zu {away}',
  'publicWeb.series.gameWonHome': 'Spiel {number}: vom Heimteam gewonnen',
  'publicWeb.series.gameWonAway': 'Spiel {number}: vom Gastteam gewonnen',
  'publicWeb.series.gameCurrent': 'Spiel {number}: läuft',
  'publicWeb.series.gameUpcoming': 'Spiel {number}: steht noch aus',
  'publicWeb.series.gameNotRequired': 'Spiel {number}: wird nicht gespielt',
  'publicWeb.series.pending': 'Serie offen bei {home}–{away}',
  'publicWeb.series.decided': '{winner} hat die Serie gewonnen',
  'publicWeb.series.aggregate': 'Insgesamt {home}–{away}',

  'publicWeb.live.usingLastKnown': 'Letzter bekannter Stand wird angezeigt.',

  'publicWeb.tournamentPage.description': 'Ergebnisse, Tabelle und Reglement für {tournament}.',

  'publicWeb.livePage.title': 'Live',
  'publicWeb.livePage.seriesHeading': 'Serie',
  'publicWeb.livePage.upcomingHeading': 'Bevorstehend',
  'publicWeb.livePage.leadersHeading': 'Spitzenreiter',

  'publicWeb.bracketPage.title': 'Turnierbaum',

  'publicWeb.playerProfile.heading': 'Spielerprofil',
  'publicWeb.playerProfile.age': 'Alter: {age}',
  'publicWeb.playerProfile.nationality': 'Nationalität: {country}',
  'publicWeb.playerProfile.historyHeading': 'Wettbewerbsverlauf',
  'publicWeb.playerProfile.careerStatsHeading': 'Karrierestatistiken',
  'publicWeb.playerProfile.noHistory': 'Kein Wettbewerbsverlauf erfasst.',
  'publicWeb.playerProfile.noStats': 'Keine Karrierestatistiken erfasst.',
  'publicWeb.playerProfile.close': 'Schließen',
  'publicWeb.playerProfile.photoAlt': '{name}',
  'publicWeb.playerProfile.photoPlaceholderAlt': 'Kein Foto hochgeladen',

  'publicWeb.tournamentsPage.title': 'Turniere',
  'publicWeb.tournamentsPage.liveHeading': 'Live & Aktiv',
  'publicWeb.tournamentsPage.upcomingHeading': 'Bevorstehend',
  'publicWeb.tournamentsPage.finishedHeading': 'Beendet & Archiv',
  'publicWeb.tournamentsPage.empty': 'Keine veröffentlichten Turniere gefunden.',
  'publicWeb.tournamentsPage.champion': 'Meister',
  'publicWeb.tournamentsPage.runnerUp': 'Zweitplatzierter',
  'publicWeb.tournamentsPage.viewDetails': 'Turnier anzeigen',
  'publicWeb.orgPage.featuredHeading': 'Hervorgehoben',
  'publicWeb.orgPage.clubsHeading': 'Vereine',
  'publicWeb.orgPage.noClubs': 'Noch keine Vereine registriert.',
  'publicWeb.orgPage.emblemAlt': 'Wappen von {name}',
  'publicWeb.orgPage.emblemPlaceholderAlt': 'Kein Wappen hochgeladen',
  'publicWeb.orgPage.notFoundTitle': 'Organisation nicht gefunden',
  'publicWeb.orgPage.notFoundBody': 'An dieser Adresse existiert keine Organisation.',
};
