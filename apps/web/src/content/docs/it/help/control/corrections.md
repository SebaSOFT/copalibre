---
title: Correzioni e conflitti offline
description: Anteprima di una correzione, cosa fa una correzione di serie, e perché un risultato in coda contro una partita annullata viene conservato, non scartato.
capabilities:
  - tournament-engine/result-correction-authority
  - live-operations/live-match-operations
roles:
  - admin
  - referee
---

## Perché una correzione non è mai una modifica diretta

Un risultato calcolato non può essere sovrascritto. Una volta conclusa una partita, modificarla passa
invece da una correzione controllata — un'azione esplicita che registra chi l'ha fatta, quando, perché,
lo stato precedente e lo stato risultante. Questo è l'unico percorso di ritorno verso un risultato
concluso, dalla [console live](/help/control/match-console), dai
[dati di partita caricati](/help/control/load-match-data), o da
[calendario](/help/control/schedule).

## Anteprima prima di applicare

Una correzione mostra un'anteprima del proprio impatto a valle prima di essere applicata: quali
classifiche, tabelle e proiezioni cambierebbero se venisse applicata. Nulla viene ricalcolato finché la
correzione non viene confermata esplicitamente.

Una correzione non si propaga automaticamente in una fase che ha già iniziato a usare il risultato
corretto — un risultato della fase a gironi che alimenta un tabellone già iniziato non lo rimescola in
silenzio. La correzione si applica comunque al registro; la fase a valle viene segnalata per la revisione
dell'organizzatore stesso, invece di essere riscritta al suo posto.

## Correggere una partita di una serie

Correggere una partita di una [serie](/help/control/series) mostra l'anteprima del suo effetto
sull'intera serie, non solo su quella partita — un punteggio corretto può capovolgere quale parte sta
conducendo un al-meglio-delle, o cambiare un totale aggregato, e l'anteprima lo mostra prima che la
correzione venga confermata.

## Perché un risultato offline in coda può essere rifiutato e conservato

La console partita continua a funzionare offline e invia le azioni in coda una volta ripristinata la
connettività. Un risultato in coda può essere rifiutato alla riconnessione — più spesso perché la
partita a cui si riferiva è stata annullata da una decisione di serie mentre l'operatore registrava
offline, e non verrà mai giocata. Quell'elemento in coda non viene scartato: il suo contenuto completo
resta in coda, rifiutato, così l'operatore può giudicare se il risultato appartiene altrove — tipicamente
come correzione a una partita precedente della stessa serie — invece di perdere ciò che è stato
registrato. Un rifiuto su un elemento non blocca mai il resto della coda dallo svuotarsi.
