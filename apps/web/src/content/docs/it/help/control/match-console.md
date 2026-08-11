---
title: Console partita dal vivo
description: Cosa fa la console partita, e cosa non si può più cambiare una volta caricato un risultato.
---

## A cosa serve questa schermata

È la schermata di gestione di una partita in corso: registrare eventi e segmenti man mano che
accadono, e caricare il risultato finale quando la partita termina. Ciò che avviene qui viene
trasmesso dal vivo sulla schermata pubblica del torneo.

## Campi chiave

- **Evento**: un fatto puntuale della partita (un punto, un cartellino, una sostituzione) registrato
  con il suo momento esatto — forma la cronologia ricostruibile della partita, non solo il punteggio
  finale.
- **Segmento**: una divisione della partita con il proprio cronometro (un set, un periodo). Il
  cronometro e il risultato sono gestiti per segmento, non come un unico cronometro per l'intera
  partita.
- **Risultato**: il risultato finale della partita, caricato una sola volta. Una volta caricato, non
  viene sovrascritto da questa schermata — qualsiasi correzione successiva passa attraverso il
  flusso tracciato di correzione/sostituzione, non ricaricandolo qui.

## Cosa non puoi fare dopo aver caricato il risultato

Una volta terminata la partita, questa schermata non permette più di aggiungere eventi come se la
partita continuasse, né di ricaricare direttamente il risultato. È intenzionale: protegge
l'integrità della cronologia già pubblicata.
