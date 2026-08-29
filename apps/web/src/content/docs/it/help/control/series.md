---
title: Serie multi-partita
description: Dichiarare una serie, cosa fa ogni classe di risoluzione, programmarne le partite, e leggerne una sul tabellone pubblico.
capabilities:
  - tournament-engine/match-series
roles:
  - admin
  - referee
  - broadcaster
  - viewer
---

## Cos'è una serie

Una serie risolve un incontro tra due partecipanti con più di una partita anziché una sola. Non ha una
schermata propria — si dichiara nella procedura guidata di
[creazione torneo](/help/control/tournament-authoring), si programma su
[calendario](/help/control/schedule), si registra partita per partita sulla
[console live](/help/control/match-console) o viene
[caricata](/help/control/load-match-data) in seguito, e si legge sul tabellone pubblico. Un incontro che
non dichiara una serie genera esattamente una partita e si comporta esattamente come sempre.

## Dichiararla

Una serie dichiara un'estensione (quante partite può disputare) e una classe di risoluzione:

- **Al meglio delle**: la serie termina non appena una parte ha vinto abbastanza partite da rendere
  irrilevanti quelle restanti. Un'estensione al-meglio-delle deve essere dispari, così una maggioranza
  è sempre possibile.
- **Aggregato**: il vincitore è chi ha segnato di più in totale su tutte le partite, sommate — non chi
  ha vinto più partite singole.
- **Punti per manche**: ogni partita della serie assegna i propri punti, e il vincitore della serie è
  chi ne accumula di più in totale.

Una serie può anche essere segnata come giocata in campo neutro, e la sua classifica può contare ogni
partita separatamente (predefinito — ogni partita aggiunge la propria vittoria, pareggio o sconfitta) o
l'intera serie (tutta la serie aggiunge un unico risultato, indipendentemente da quante partite sono
servite).

## Programmarla e giocarla

Ogni partita della serie riceve il proprio slot e i propri ufficiali di gara nella schermata
[calendario](/help/control/schedule). Una volta decisa la serie — una parte si è assicurata un
al-meglio-delle, oppure restano poche manche capaci di cambiare il risultato — le sue partite restanti
sono marcate come non più necessarie, invece di apparire non programmate o abbandonate.

## Cosa non puoi fare qui

Una partita già giocata e registrata non può essere "sgiocata" ridichiarando la serie: correggere una
partita conclusa di una serie decisa passa dal
[flusso di correzione controllato](/help/control/corrections), che blocca esplicitamente la
propagazione di una correzione in una fase che ha già iniziato a usare il risultato della serie.
