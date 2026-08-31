/**
 * French translations, keyed to match `public-messages.en.ts`'s IDs exactly
 *. Best-effort translation; native-speaker review is a later pass
 * (owner's explicit choice).
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
  'publicWeb.standings.grain.series': 'Ce tableau compte un résultat par série.',
  'publicWeb.standings.grain.match': 'Ce tableau compte un résultat par match joué.',
  'publicWeb.standings.column.series.label': 'Séries',
  'publicWeb.standings.column.series.shortLabel': 'S',

  'publicWeb.hero.liveCount': '{count} EN DIRECT',
  'publicWeb.hero.noLiveMatches': 'AUCUN MATCH EN DIRECT',

  'publicWeb.bracket.roundAriaLabel': '{branch} — tour {round}',
  'publicWeb.bracket.roundHeading': 'Tour {round}',

  'publicWeb.broadcastStatus.note':
    'Les résultats se mettent à jour automatiquement en cas de connexion. Sinon, cette page contient déjà tout.',

  'publicWeb.ticker.heading': 'Matchs',
  'publicWeb.ticker.empty': 'Aucun match programmé pour le moment.',

  'publicWeb.series.ariaLabel': 'Série au meilleur de {bestOf} : {home} à {away}',
  'publicWeb.series.gameWonHome': 'Match {number} : gagné par les locaux',
  'publicWeb.series.gameWonAway': 'Match {number} : gagné par les visiteurs',
  'publicWeb.series.gameCurrent': 'Match {number} : en cours',
  'publicWeb.series.gameUpcoming': 'Match {number} : à jouer',
  'publicWeb.series.gameNotRequired': 'Match {number} : ne sera pas joué',
  'publicWeb.series.pending': 'Série indécise à {home}–{away}',
  'publicWeb.series.decided': '{winner} a gagné la série',
  'publicWeb.series.aggregate': 'Au cumul {home}–{away}',

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
  'publicWeb.playerProfile.photoAlt': '{name}',
  'publicWeb.playerProfile.photoPlaceholderAlt': 'Aucune photo téléversée',

  'publicWeb.tournamentsPage.title': 'Tournois',
  'publicWeb.tournamentsPage.liveHeading': 'En direct et actifs',
  'publicWeb.tournamentsPage.upcomingHeading': 'À venir',
  'publicWeb.tournamentsPage.finishedHeading': 'Terminés et archives',
  'publicWeb.tournamentsPage.empty': 'Aucun tournoi publié trouvé.',
  'publicWeb.tournamentsPage.champion': 'Champion',
  'publicWeb.tournamentsPage.runnerUp': 'Deuxième',
  'publicWeb.tournamentsPage.viewDetails': 'Voir le tournoi',
  'publicWeb.orgPage.featuredHeading': 'À la une',
  'publicWeb.orgPage.clubsHeading': 'Clubs',
  'publicWeb.orgPage.noClubs': "Aucun club enregistré pour l'instant.",
  'publicWeb.orgPage.emblemAlt': 'Emblème de {name}',
  'publicWeb.orgPage.emblemPlaceholderAlt': 'Aucun emblème téléversé',
  'publicWeb.orgPage.notFoundTitle': 'Organisation introuvable',
  'publicWeb.orgPage.notFoundBody': "Aucune organisation n'existe à cette adresse.",

  'publicWeb.matchesView.pageTitle': 'Matchs',
  'publicWeb.matchesView.filterAll': 'Tous',
  'publicWeb.matchesView.filterLive': 'En direct',
  'publicWeb.matchesView.filterUpcoming': 'À venir',
  'publicWeb.matchesView.filterFinal': 'Terminés',
  'publicWeb.matchesView.empty': 'Aucun match dans ce périmètre pour le moment.',
  'publicWeb.matchesView.clockAriaLabel': 'Temps écoulé : {time}',
  'publicWeb.matchesView.venueAriaLabel': 'Lieu : {venue}',
  'publicWeb.matchesView.latestEventAriaLabel': 'Dernier événement : {event}',
  'publicWeb.matchesView.zoneGroupAriaLabel': 'Zone/groupe : {scope}',
  'publicWeb.matchesView.positionInGroup': '{group} — position n° {position}',
  'publicWeb.matchesView.position': 'Position n° {position}',
  'publicWeb.matchesView.decidedBy': 'Décidé par : {factor}',
  'publicWeb.matchesView.decidedByAriaLabel':
    'Le facteur décisif entre des positions à égalité. Un organisateur autorisé peut voir l’explication complète dans le panneau de contrôle.',
  'publicWeb.matchesView.fullTraceHeading': 'Trace complète du comparateur de classement',
  'publicWeb.matchesView.seeAll': 'Voir tous les matchs',
};
