---
title: Console partita dal vivo
description: Cosa fa la console partita, e cosa non si può più cambiare una volta caricato un risultato.
capabilities:
  - live-operations/live-match-console
  - live-operations/live-match-operations
  - live-operations/realtime-events
  - tournament-engine/declared-tagging
roles:
  - referee
  - admin
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

## Gestire l'orologio

Ogni segmento ha il proprio orologio. I pulsanti sotto il segmento selezionato dipendono dal suo stato:

- **Avvia partita** avvia una partita programmata e fa partire il suo primo segmento.
- **Avvia segmento** fa partire un segmento che non è ancora stato giocato.
- **Pausa** e **Termina segmento** compaiono mentre un segmento è in corso. Pausa ferma l'orologio dove si trova; una partita in pausa resta in corso.
- **Riprendi** e **Termina segmento** compaiono quando il segmento è fermo con del tempo accumulato.
- **Riapri segmento…** compare su un segmento terminato. Chiede un motivo, riporta il segmento in pausa con il tempo conservato e non fa ripartire l'orologio: per farlo ripartire usa Riprendi.

Gira un solo segmento alla volta. Avvia segmento e Riprendi non vengono proposti mentre un altro segmento è in corso, e la console lo indica: mettilo in pausa o terminalo prima.

Il selettore del segmento mostra «in pausa» un segmento fermo con del tempo. Una partita chiusa (finalizzata, per forfait o non richiesta) non offre azioni sull'orologio.

**Correggi** imposta il tempo del segmento selezionato, da scrivere nel campo **Tempo (mm:ss)**, in minuti e secondi (`20:50`) o in minuti interi (`45`). Lo stato resta invariato: un segmento in corso continua, uno in pausa resta in pausa. Non è disponibile su una partita chiusa (finalizzata, per forfait o non richiesta).

Questi pulsanti registrano il momento in cui hai davvero fischiato. Per correggere un valore registrato male usa **Correggi**. Ogni modifica finisce nello stesso registro di audit, con chi, quando, e stato e orologio prima e dopo. La riapertura registra anche il motivo.

## Leggere il registro eventi

Il registro parte compresso, mostrando i tre eventi più recenti, così i comandi di registrazione
stanno in una sola schermata mentre lavori. Quello che hai appena registrato è sempre tra questi:
comprimere toglie dalla vista la cronologia vecchia, mai la tua ultima conferma. **Mostra cronologia
completa** apre l'intera partita.

## Cosa non puoi fare dopo aver caricato il risultato

Una volta terminata la partita, questa schermata non permette più di aggiungere eventi come se la
partita continuasse, né di ricaricare direttamente il risultato. È intenzionale: protegge
l'integrità della cronologia già pubblicata.

## Lavorare con una connessione poco affidabile

La connettività a bordo campo si interrompe. Questa schermata è pensata per questo: registrare un
evento, regolare il cronometro, selezionare una formazione o finalizzare una partita scrive prima
in una coda locale durevole — _prima ancora_ di tentare l'invio — così un segnale interrotto non fa
mai perdere qualcosa che hai già fatto.

- **Un punto di connessione** è sempre visibile in alto nella schermata: pieno quando sei online,
  vuoto quando non lo sei. Passaci sopra il mouse o dagli il focus per vedere quante azioni sono
  ancora in attesa di invio e quando l'ultima è effettivamente andata a buon fine.
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
