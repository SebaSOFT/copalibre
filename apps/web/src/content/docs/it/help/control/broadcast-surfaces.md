---
title: Superfici di trasmissione e pubbliche
description: Token di visualizzazione per schermi TV in sede e overlay di streaming, e cosa vede uno spettatore sul sito pubblico.
capabilities:
  - live-operations/broadcast-tv-surfaces
  - live-operations/public-live-surfaces
  - public-web/public-web-shell
roles:
  - broadcaster
  - admin
---

## Token di visualizzazione

Una route `/tv/**` — una visualizzazione a rotazione completa o una singola partita fissata, come pagina
normale o come `?mode=overlay` trasparente per la cattura chroma-key in uno streaming — è autorizzata da
un token di visualizzazione proprio del dispositivo, non dall'accesso di una persona. Il token viene
emesso dal pannello dell'organizzazione, vincolato a una route `/tv/**` specifica, e revocabile in modo
indipendente: revocare il token di un dispositivo ferma solo quel dispositivo, e nessun altro dispositivo
né sessione di alcuna persona ne viene influenzato.

Un dispositivo con un token valido non ha bisogno di nessuno presente per continuare a funzionare.
Sopravvive a uno spegnimento improvviso senza dover reinserire le credenziali, e si riprende in silenzio
da una connessione persa o da dati non disponibili — una superficie `/tv/**` non mostra mai un errore che
una persona dovrebbe chiudere.

## Studio del trasmettitore

`/control/<organization>/tournaments/<tournament>/broadcaster` è una console self-service per uno
streamer o un operatore media: emette automaticamente un proprio token di visualizzazione, ti
permette di scegliere la modalità overlay (una fascia inferiore sopra la tua telecamera, o una
scena a schermo intero senza telecamera) e uno sfondo di anteprima (trasparente, schermo verde,
schermo magenta o uno sfondo scuro da stadio), e ti fornisce un URL OBS Browser Source pronto da
incollare con anteprima dal vivo — nessun amministratore deve darti un token né condividere il
proprio accesso. Mentre quell'overlay è aperto, un gol, un punto o un cartellino registrato dal
vivo mostra un avviso animato con il nome della squadra e del giocatore, per poi chiudersi da solo
— non serve mai che qualcuno sul posto lo attivi o lo chiuda.

## Cosa mostra lo schermo della sede

Lo schermo a rotazione completa scorre la classifica, i migliori giocatori, le statistiche del torneo e, quando la fase in evidenza lo ha, il tabellone, poi l’elenco delle partite. Un indirizzo con `?view=standings` o `?view=matches` blocca quell’unica sezione a schermo intero invece di ruotare (`?view=fixtures` continua a funzionare come vecchio nome di `matches`). Il riepilogo del campione di un torneo concluso appartiene solo allo schermo a rotazione. L’intestazione indica lo stato del torneo: uno in corso mostra un orologio con etichetta, al minuto, nel fuso orario dell’organizzazione; uno concluso mostra il giorno dell’ultima partita, senza orologio che scorre.

Una partita fissata — `/tv/<organizzazione>/tournaments/<torneo>/stages/<fase>/matches/<numero>` — è indicata come nella pagina pubblica della partita, dal suo numero nella fase, e mostra sempre punteggio, lati ed eventi registrati, conclusa o no. Un numero che la fase non ha è segnalato come partita inesistente.

Una fase può mescolare i formati, quindi lo schermo presenta ogni zona secondo il formato che gioca:

- **Classifica**: Ogni zona che ordina i partecipanti in una tabella ha la sua tabella, intestata col nome della zona. Le righe di zone diverse non si mescolano mai in un'unica classifica, e ogni tabella mostra fino a otto righe. Una fase le cui zone giocano tutte il formato della fase mantiene una sola tabella senza intestazione.
- **Tabellone**: Le zone che giocano un formato a eliminazione sono disegnate come tabellone.
- **Partite**: Elenca tutte le partite del torneo in una tabella compatta, due per riga con sigle e punteggio, una pagina alla volta; le pagine avanzano con la rotazione e una vista `matches` fissa continua a scorrere.

La sovrimpressione del terzo inferiore non cambia: nomina una partita, non una fase.

## Cosa vede uno spettatore sul sito pubblico

Il sito pubblico (senza accesso) mostra le classifiche, il tabellone e i report partita di un torneo
così come vengono pubblicati, allo stesso indirizzo organizzazione/torneo usato dal pannello di
controllo e dalle superfici `/tv/**`. Una [serie](/help/control/series) in corso mostra il proprio
punteggio dal vivo e quale parte sta vincendo sul tabellone pubblico nello stesso modo del pannello di
controllo, e una partita non ancora programmata è mostrata come tale, mai indovinata.

Sullo schermo TV, il riepilogo di un torneo concluso deciso zona per zona elenca il campione o i campioni a pari merito di ogni zona dell’ultima fase sotto il nome della zona, gli stessi vincitori mostrati dalla panoramica pubblica. Un torneo con un solo campione mantiene la presentazione del campione unico, e il leader della classifica di una fase precedente non viene mai presentato come campione.

## Cosa non puoi fare qui

Nessuna delle due superfici accetta input da uno spettatore o da un dispositivo TV: entrambe sono
rappresentazioni di sola lettura di dati già pubblicati. Cambiare ciò che viene pubblicato avviene nel
pannello di controllo proprio dell'organizzazione, non sulle superfici pubbliche né su quelle `/tv/**`.
