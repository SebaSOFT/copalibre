---
title: Piano di promozione
description: Configura come i gironi di una zona si combinano nella semina della fase successiva — rivisto prima di applicarlo.
capabilities:
  - tournament-engine/stage-qualification
roles:
  - admin
---

## A cosa serve questa schermata

Una volta che i gironi di una zona hanno terminato la loro fase a girone all'italiana, questa
schermata configura quanti partecipanti avanzano da ciascun girone e come questi gironi si combinano
in un'unica lista ordinata per la fase successiva. Poi mostra quella lista ordinata e calcolata per la
revisione — non crea né modifica mai alcuna semina da sola.

## Campi chiave

- **Partecipanti che avanzano per girone**: quanti partecipanti da ciascun girone vengono promossi.
- **Fasce**: quando la fase successiva ha più di una zona, quale porzione contigua della lista
  combinata viene indirizzata a quale delle zone di quella fase.
- **Revisione**: la lista ordinata dei candidati che questo piano promuoverebbe, calcolata sempre allo
  stesso modo — nulla viene scritto nella fase successiva finché un operatore non configura
  esplicitamente la sua semina dal costruttore della semina, che si precompila da un piano rivisto
  quando ne esiste uno.

## Cosa non puoi fare qui

Se un girone ha una parità non risolta alla propria linea di taglio, questa schermata lo segnala
invece di presentare una lista incompleta — risolvi la parità (una correzione tracciata, se il
risultato di origine ne richiede una) prima che si possa calcolare una lista combinata.
