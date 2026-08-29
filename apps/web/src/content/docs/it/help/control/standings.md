---
title: Classifica
description: Cosa rappresenta la tabella della classifica di una fase e come vengono spiegati gli spareggi.
capabilities:
  - tournament-engine/standings-explainability
  - tournament-engine/statistic-collectors
roles:
  - admin
  - club-admin
  - referee
  - broadcaster
  - viewer
---

## A cosa serve questa schermata

Mostra la tabella della classifica di una fase del torneo — chi è dove e perché, con la spiegazione
del calcolo visibile, non solo il numero finale.

## Campi chiave

- **Fase (stage)**: una tappa del torneo (ad esempio, "fase a gironi" o "playoff") con il proprio
  formato e la propria tabella. Un torneo può avere più fasi concatenate.
- **Punti/criteri**: i criteri di calcolo e spareggio sono quelli dichiarati dalla disciplina —
  questa schermata non inventa mai un proprio criterio, applica e mostra solo quello che corrisponde
  alla configurazione vigente al momento del calcolo.
- **Spiegabilità**: ogni posizione può essere espansa per vedere esattamente quali dati e quale
  regola hanno determinato quel piazzamento — il percorso decisionale che ha prodotto il numero, non
  solo il numero.

## Quando si aggiorna

La tabella riflette i risultati già caricati e le correzioni già applicate. Un risultato corretto
ricalcola l'intera tabella a partire dai fatti attualmente vigenti, senza mai regolare il numero
manualmente.
