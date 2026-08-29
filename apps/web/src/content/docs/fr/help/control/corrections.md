---
title: Corrections et conflits hors ligne
description: Prévisualiser une correction, ce que fait une correction de série, et pourquoi un résultat en file contre un match annulé est conservé, pas jeté.
capabilities:
  - tournament-engine/result-correction-authority
  - live-operations/live-match-operations
roles:
  - admin
  - referee
---

## Pourquoi une correction n'est jamais une modification directe

Un résultat calculé ne peut pas être écrasé. Une fois un match finalisé, le modifier passe plutôt par
une correction audité — une action explicite enregistrant qui l'a faite, quand, pourquoi, l'état
antérieur et l'état résultant. C'est le seul chemin de retour vers un résultat finalisé, depuis la
[console en direct](/help/control/match-console), les
[données de match chargées](/help/control/load-match-data), ou [calendrier](/help/control/schedule).

## Prévisualisez avant d'appliquer

Une correction prévisualise son propre impact en aval avant de s'appliquer : quels classements, tableaux
et projections changeraient si elle était appliquée. Rien ne se recalcule tant que la correction n'est
pas explicitement confirmée.

Une correction ne se propage pas automatiquement dans une étape ayant déjà commencé à utiliser le
résultat corrigé — un résultat de phase de groupes alimentant un tableau déjà commencé ne rebat pas
silencieusement ce tableau. La correction s'applique quand même à l'enregistrement ; l'étape en aval est
signalée pour la propre révision de l'organisateur plutôt que réécrite à sa place.

## Corriger un match d'une série

Corriger un match d'une [série](/help/control/series) prévisualise son effet sur la série entière, pas
seulement sur ce match — un score corrigé peut inverser quel camp mène un au-meilleur-de, ou changer un
total agrégé, et la prévisualisation le montre avant que la correction soit confirmée.

## Pourquoi un résultat hors ligne en file peut être refusé et conservé

La console de match continue de fonctionner hors ligne et envoie les actions en file une fois la
connectivité rétablie. Un résultat en file peut être refusé à la reconnexion — le plus souvent parce que
le match visé a été annulé par une décision de série pendant que l'opérateur enregistrait hors ligne, et
ne sera jamais joué. Cet élément en file n'est pas jeté : son contenu complet reste dans la file, refusé,
pour que l'opérateur puisse juger si le résultat appartient ailleurs — typiquement comme correction d'un
match antérieur de la même série — plutôt que de perdre ce qui a été enregistré. Un refus sur un élément
ne bloque jamais le reste de la file.
