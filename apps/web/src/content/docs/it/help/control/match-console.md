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

## Lavorare con una connessione poco affidabile

La connettività a bordo campo si interrompe. Questa schermata è pensata per questo: registrare un
evento, regolare il cronometro, selezionare una formazione o finalizzare una partita scrive prima
in una coda locale durevole — _prima ancora_ di tentare l'invio — così un segnale interrotto non fa
mai perdere qualcosa che hai già fatto.

- **Lo stato di sincronizzazione** è sempre visibile in alto nella schermata: se sei online, quante
  azioni sono ancora in attesa di invio, e quando l'ultima è effettivamente andata a buon fine.
- **Un'azione in coda resta in coda**, senza andare persa, con una connessione instabile, una zona
  senza segnale, o anche chiudendo e riaprendo questa schermata — riaprirla riprende l'invio di
  tutto ciò che è ancora in attesa.
- **Non appena torna la connettività**, tutto ciò che era in coda viene inviato automaticamente,
  nell'ordine in cui è stato fatto.
- **Un'azione rifiutata** — una che il server avrebbe rifiutato anche dal vivo, come una modifica
  della formazione inviata dopo che la partita è già terminata — viene mostrata chiaramente, con il
  motivo, così sai esattamente cosa richiede la tua attenzione. Non blocca mai ciò che resta in coda
  dopo di essa.

Cosa questa schermata non fa: recuperare un testo o una selezione che non hai mai effettivamente
inviato. Se eri a metà di una modifica quando la connessione è caduta, quella specifica immissione
va persa come sempre — solo le azioni già tentate sono protette.
