---
title: Sistema Svizzero
description: Meccaniche di abbinamento, gruppi di punteggio, floaters e bye nei tornei svizzeri.
capabilities:
  - tournament-engine/tournament-fixture-engine
roles:
  - admin
  - tournament-admin
  - referee
  - broadcaster
  - viewer
---

## Panoramica

Il sistema svizzero abbina i partecipanti su più turni senza eliminazione diretta. A differenza dei tabelloni a eliminazione dove una sconfitta è fatale, o del girone all'italiana dove tutti affrontano tutti, il sistema svizzero prevede un numero fisso di turni contro avversari con record identici o molto simili.

## Meccaniche di Abbinamento

- **Gruppi di Punteggio**: Dopo il primo turno, i partecipanti sono suddivisi in gruppi in base ai punti accumulati (es. 2-0, 1-1, 0-2).
- **Divieto di Rivincita**: Due partecipanti non possono affrontarsi due volte nella stessa fase svizzera.
- **Floaters**: Se un gruppo contiene un numero dispari di partecipanti, un concorrente "fluttua" nel gruppo contiguo.
- **Bye**: Con un numero dispari complessivo di partecipanti, il giocatore con il punteggio più basso privo di bye ne riceve uno (1 vittoria, scarto nullo).

## Sistemi di Punteggio

- `match-wins`: Assegna punti in base all'esito del match (1 vittoria, 0.5 pareggio, 0 sconfitta).
- `game-points`: Punti basati sui differenziali di game o set.

## Classifica e Avanzamento

Le classifiche applicano criteri di difficoltà del calendario (Buchholz, Sonneborn-Berger) per determinare l'accesso ai playoff a eliminazione diretta.
