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

## Giocare un formato diverso in una zona

Per impostazione predefinita, ogni zona gioca il formato della sua fase. Apri **Cambia il formato della
zona** su una zona per assegnargliene uno proprio — per esempio due zone a eliminazione diretta e un
girone all'italiana per i club rimasti — e, se il formato lo richiede, una propria lunghezza di serie.
La schermata contrassegna la zona personalizzata e mostra il formato ereditato dalle altre; scegliere
**Formato della fase** riporta la zona a quello della fase. L'elenco dei formati è quello offerto dalla
disciplina del torneo. Quando la fase ha già delle partite, formato e serie delle zone sono bloccati.

La pagina pubblica della fase disegna poi ogni zona come richiede il suo formato: un tabellone per una zona
a eliminazione diretta, e le partite con la classifica per una zona a girone.

## Cosa non puoi fare qui

Rinominare una zona o un girone già creato non è ancora disponibile — assegna il nome con attenzione
alla creazione.
