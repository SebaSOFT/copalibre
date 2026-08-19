/**
 * French translations, keyed to match `public-messages.en.ts`'s IDs exactly
 *. Best-effort translation; native-speaker review is a later pass
 * (owner's explicit choice, 0051).
 */
export const messages: Record<string, string> = {
  'publicWeb.layout.skipToContent': 'Aller au contenu',
  'publicWeb.layout.navAriaLabel': 'Principal',
  'publicWeb.layout.footer': 'Publié avec CopaLibre — AGPL-3.0',

  'publicWeb.resultState.live': 'EN DIRECT',
  'publicWeb.resultState.upcoming': 'À VENIR',
  'publicWeb.resultState.final': 'FINAL',
  'publicWeb.resultState.disputed': 'EN LITIGE',
  'publicWeb.resultState.winner': 'GAGNÉ',
  'publicWeb.resultState.loser': 'PERDU',
  'publicWeb.resultState.tbd': 'À DÉFINIR',
  'publicWeb.resultState.cancelled': 'ANNULÉ',

  'publicWeb.resultReason.administrativeLoss': 'DÉFAITE ADM.',
  'publicWeb.resultReason.walkover': 'W/O',
  'publicWeb.resultReason.forfeitAbandonment': 'ABANDON',
  'publicWeb.resultReason.disqualified': 'DISQUALIFIÉ',
  'publicWeb.resultReason.didNotFinish': 'NON TERMINÉ',

  'publicWeb.legend.heading': 'Légende',

  'publicWeb.ruleset.heading': 'Règlement',

  'publicWeb.standings.heading': 'Classement',
  'publicWeb.standings.empty': 'Le classement apparaît après le premier match joué.',
  'publicWeb.standings.team': 'Équipe',
  'publicWeb.standings.played': 'MJ',
  'publicWeb.standings.points': 'Pts',

  'publicWeb.hero.liveCount': '{count} EN DIRECT',
  'publicWeb.hero.noLiveMatches': 'AUCUN MATCH EN DIRECT',

  'publicWeb.bracket.roundAriaLabel': '{branch} — tour {round}',
  'publicWeb.bracket.roundHeading': 'Tour {round}',

  'publicWeb.broadcastStatus.note':
    'Les résultats se mettent à jour automatiquement en cas de connexion. Sinon, cette page contient déjà tout.',

  'publicWeb.ticker.heading': 'Matchs',
  'publicWeb.ticker.empty': 'Aucun match programmé pour le moment.',

  'publicWeb.series.ariaLabel': 'Série au meilleur de {bestOf} : {home} à {away}',

  'publicWeb.live.usingLastKnown': 'Affichage du dernier état connu.',

  'publicWeb.tournamentPage.description': 'Résultats, classement et règlement de {tournament}.',

  'publicWeb.livePage.title': 'En direct',
  'publicWeb.livePage.seriesHeading': 'Série',
  'publicWeb.livePage.upcomingHeading': 'À venir',
  'publicWeb.livePage.leadersHeading': 'Meneurs',

  'publicWeb.bracketPage.title': 'Tableau',

  'publicWeb.playerProfile.heading': 'Profil du Joueur',
  'publicWeb.playerProfile.age': 'Âge : {age}',
  'publicWeb.playerProfile.nationality': 'Nationalité : {country}',
  'publicWeb.playerProfile.historyHeading': 'Historique des Compétitions',
  'publicWeb.playerProfile.careerStatsHeading': 'Statistiques en Carrière',
  'publicWeb.playerProfile.noHistory': 'Aucun historique de compétition enregistré.',
  'publicWeb.playerProfile.noStats': 'Aucune statistique en carrière enregistrée.',
  'publicWeb.playerProfile.close': 'Fermer',
};
