---
title: Calendario
description: Assegna ogni partita a uno slot — un orario, una sede e una durata dichiarati — e gli ufficiali di gara che la seguono.
capabilities:
  - control-web/match-scheduling
  - tournament-engine/schedule-slots
roles:
  - admin
---

## A cosa serve questa schermata

Ogni partita di una fase riceve qui uno slot assegnato — una vista calendario e una vista elenco sullo
stesso lotto. Uno slot non si digita a mano per ogni partita: è un orario di inizio, una sede e una
durata dichiarati una volta nel pool di risorse [sedi e ufficiali di gara](/help/control/resources), e
il costruttore del calendario assegna una partita a uno di essi, non il contrario. Gli ufficiali di gara
si attivano per partita dallo stesso pool di risorse.

## Grana della partita, non dell'incontro

La programmazione opera sulla partita, non sull'incontro tra due partecipanti. Un incontro a partita
singola ha una partita da collocare; una [serie](/help/control/series) di cinque ne ha cinque, ognuna
con il proprio slot e i propri ufficiali di gara — la quarta e la quinta partita della serie possono
occupare slot riservati mai riempiti se la serie si decide prima, e il costruttore le marca come non più
necessarie invece di lasciarle con l'aspetto di non programmate.

## Anteprima prima di pubblicare

Prima che qualcosa venga pubblicato, il costruttore mostra un'anteprima del lotto ed evidenzia ogni
conflitto — una sede o un ufficiale di gara prenotato due volte, una violazione della regola di riposo —
nominando le partite coinvolte, e nomina qualsiasi partita già pubblicata che il lotto sposterebbe. La
pubblicazione è atomica: ogni assegnazione del lotto entra in vigore insieme, oppure nessuna lo fa.

## Quanto occupa una partita il suo slot

Una partita collocata occupa l’inizio del suo slot più la sua **durata stimata**: il tempo
regolamentare della disciplina (per esempio due tempi da 25 minuti, 50 minuti), con il numero di
periodi proprio del torneo. Una disciplina senza tempo regolamentare (giocata a set, per esempio)
occupa l’intero slot. L’impianto resta inoltre riservato per il cambio tra una partita e l’altra.
Così gli slot brevi non nascondono mai un conflitto: due partite da 50 minuti a quindici minuti di
distanza sullo stesso campo sono un conflitto d’impianto.

La regola del riposo viene dalle [impostazioni](/help/control/tournament-authoring) del torneo: il
riposo minimo tra la fine di una partita di un partecipante e l’inizio della successiva. Un torneo che
non la dichiara non applica alcuna regola di riposo.

## Modificare una partita pubblicata richiede un motivo

Spostare, cambiare gli ufficiali di gara o ritirare una partita già **pubblicata** chiede il motivo
prima di pubblicare. La finestra elenca ogni partita pubblicata modificata con orario e impianto
vecchi e nuovi. Indica un motivo per tutto il lotto — scegline uno comune, uno usato di recente o
scrivi il tuo — oppure segna una partita come eccezione con un motivo proprio (il pulsante «Motivo
diverso» della riga, oppure seleziona più righe e segnale insieme). La pubblicazione resta
disattivata finché ogni partita elencata non ha un motivo. Slot, impianto, orario e ufficiali
precedenti vengono conservati con il motivo, la persona e l’ora. Un lotto di prime collocazioni si
pubblica senza chiedere.

Da tastiera: ↑/↓ si spostano tra le partite, Spazio seleziona, E segna un’eccezione, Invio pubblica
ed Esc chiude: prima l’elenco di suggerimenti aperto, poi la finestra di dialogo.

## Ritirare una partita dal suo slot

«Ritira dallo slot» toglie una partita collocata dal suo slot all’interno del lotto: l’anteprima la
mostra senza orario ed elenca gli slot liberati, così un’altra partita può prenderne uno nella stessa
pubblicazione.

## Cosa non puoi fare qui

Riprogrammare una partita già conclusa viene rifiutato: il suo orario è ormai un registro, non un piano,
e modificarlo passa invece dal [flusso di correzione controllato](/help/control/corrections). Una
partita senza slot assegnato è mostrata esplicitamente come priva di partita programmata — mai omessa in
silenzio, e mai confusa con un bye del tabellone. Creare o modificare una sede o un ufficiale di gara
avviene in [sedi e ufficiali di gara](/help/control/resources), non qui.
