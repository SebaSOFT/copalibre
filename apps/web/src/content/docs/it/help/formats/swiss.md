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

## Generare il turno successivo

Le fasi svizzere e a eliminazione diretta costruiscono ogni turno da quello precedente, quindi l’operatore genera un turno solo quando il precedente è concluso.

- **Per zona**: Turni, abbinamenti e risultati appartengono a una zona. Una fase con più zone fa avanzare ogni zona per conto suo, e una zona non abbina mai partecipanti di un’altra.
- **Dove**: A fase sorteggiata, la schermata della fase offre l’azione **Genera il turno successivo** per ogni zona che gioca con il sistema svizzero o a eliminazione diretta. Le zone con un altro formato, come il girone all’italiana, non ce l’hanno.
- **Quando viene rifiutata**: Una zona non avanza finché una partita del suo turno corrente non è conclusa. Questo blocca solo quella zona; le altre possono avanzare.
- **Tramite API**: `POST .../stages/{stageNumber}/rounds/next` con `{ "zoneNumber": 2 }`. La zona è obbligatoria se la fase ne ha più di una; una fase con una sola zona non richiede corpo.
