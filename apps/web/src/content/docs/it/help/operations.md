---
title: Gestione e tracciabilità
description: Regole per gestire le partite e correggere i dati del torneo.
capabilities:
  - platform/async-job-processing
  - platform/persistence-layer
  - platform/release-process
roles:
  - super-admin
---

## Console partita

Registra eventi e cronometro da una console autorizzata. La proiezione pubblica si aggiorna a
partire da eventi durevoli e conserva una versione per il ripristino. Ogni azione viene scritta
prima in una coda locale prima di essere inviata, così una connessione caduta la lascia in coda per
un nuovo tentativo automatico invece di perderla — vedi
[Console partita dal vivo](/it/help/control/match-console/) per il comportamento completo.

## Correzioni

Non sovrascrivere mai un risultato calcolato. Una correzione richiede un motivo, un autore e
un'anteprima dell'impatto prima di incidere sulla classifica o sulle fasi successive.

## Formazione

La formazione rappresenta i giocatori selezionati da un partecipante per una partita. Non
rappresenta una relazione persistente tra una persona e una squadra.
