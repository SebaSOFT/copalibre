---
title: Carica dati della partita
description: Inserimento in blocco/strutturato per una partita giocata senza console live presente.
---

## A cosa serve questa schermata

Non tutte le partite hanno un operatore alla console mentre vengono giocate. Questa schermata ti
permette di inserire la rosa di una partita, la sua cronologia completa di eventi e il suo risultato
finale insieme, a posteriori — per un club che riporta una partita in trasferta, o un organizzatore che
recupera un arretrato di referti cartacei.

Si applica solo a una partita programmata senza attività già registrata. Una partita che ha già eventi
o segmenti di una sessione live deve essere conclusa tramite la
[console live](/help/control/match-console) invece — caricare una seconda cronologia sopra una live
entrerebbe in conflitto con essa.

## Campi chiave

- **Rosa**: la stessa selezione di giocatori per partecipante offerta dalla console live, mantenuta
  solo in questa schermata finché non invii — nulla viene salvato sulla partita finché l'intero lotto
  non viene inviato.
- **Segmenti**: ogni periodo/tempo/set che la partita ha avuto, nell'ordine di gioco, ciascuno già
  contrassegnato come completo con la sua durata. Qui non c'è un cronometro live.
- **Eventi**: la cronologia completa della partita, nell'ordine in cui è realmente avvenuta, ciascuno
  con il proprio orario reale — non il momento in cui lo stai inserendo.
- **Risultato**: il risultato finale della partita, inviato insieme a tutto quanto sopra.

## Un solo invio, tutto o niente

Premere "Invia dati della partita" invia la rosa, ogni evento e il risultato insieme, in un'unica
transazione. Se un solo evento non è valido, non viene registrato nulla — l'intero invio viene
rifiutato, e quanto inserito rimane nella schermata così puoi correggere l'unica voce che ha fallito e
reinviare, invece di ricominciare da capo.

## Importare da un foglio di calcolo

La sezione "Importa da CSV" carica un foglio di calcolo nello stesso editor sopra, per la revisione
prima dell'invio — non salta mai il passaggio di revisione né la validazione dell'invio. Scarica il
modello per conoscere la forma esatta di colonne richiesta da un file.
