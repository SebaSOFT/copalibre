---
title: Zone e gironi
description: Crea zone e gironi all'interno di una fase, e assegna i partecipanti.
capabilities:
  - control-web/zone-group-management
roles:
  - admin
---

## A cosa serve questa schermata

Alcuni tornei dividono una fase in zone separate (ad esempio "Coppa Oro" e "Coppa Argento"), e ogni
zona in gironi che giocano un girone all'italiana tra loro. Questa schermata crea quelle zone e gironi,
e vi assegna i partecipanti — sia tramite lo stesso sorteggio automatico deterministico e rispettoso
dei vincoli usato per la semina del tabellone, sia posizionando ciascun partecipante manualmente.

Una fase che non ha mai avuto una zona o un girone esplicito creato ne mostra esattamente uno per
tipo — quello implicito che ogni fase ha già.

## Campi chiave

- **Zona**: una suddivisione denominata di una fase (ad esempio una coppa separata all'interno della
  stessa fase).
- **Girone**: una suddivisione denominata di una zona, che gioca un girone all'italiana tra i propri
  partecipanti.
- **Sorteggio automatico**: la stessa assegnazione deterministica e rispettosa dei vincoli già usata
  dal costruttore della semina del tabellone e dall'assegnazione dei lobby delle batterie — si ripete
  identica dato lo stesso seme.
- **Posizionamento manuale**: assegnare ogni partecipante direttamente a un numero di zona o girone,
  registrato esattamente come risulterebbe da un sorteggio automatico.

## Cosa non puoi fare qui

Rinominare una zona o un girone già creato non è ancora disponibile — assegna il nome con attenzione
alla creazione.
