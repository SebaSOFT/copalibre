---
title: Vista partite
description: Un elenco a schede delle partite di un torneo, facile da scorrere — sede, cronometro, ultimo evento e contesto di classifica — sul sito pubblico e nel pannello di controllo.
capabilities:
  - public-web/matches-view
  - control-web/matches-view
roles:
  - admin
  - viewer
  - broadcaster
  - referee
---

## A cosa serve questa schermata

Qualunque sia la struttura di una fase — un solo girone, più zone, o una serie di più partite — si
riduce sempre a un elenco di partite da giocare. Questa schermata è quell'elenco, come una griglia di
schede: l'intero torneo per impostazione predefinita, oppure limitata a una fase, una zona/girone, o
uno stato (in diretta, in programma, finale) con i filtri in alto. Completa, senza sostituirlo, il
[tabellone](/help/control/tournament-authoring) — il tabellone è la lettura giusta per l'avanzamento a
eliminazione; questa è la lettura giusta per scorrere il volume, specialmente tra più gironi
all'italiana simultanei che un tabellone non ha un buon modo di mostrare tutti insieme.

Esistono due versioni di questa schermata, che condividono la stessa scheda:

- **Pubblica** (`/{organizzazione}/tournaments/{torneo}/matches`) — anonima, senza necessità di
  accesso.
- **Pannello di controllo** (`.../matches-view`) — raggiungibile solo da un admin dell'organizzazione o
  da un tournament-admin con autorità su questo torneo, la stessa autorità già richiesta dalla
  schermata di classifica interna.

## Cosa mostra ogni scheda

- **Stato**: in diretta, in programma o finale, insieme a un'icona così che lo stato non dipenda mai
  solo dal colore.
- **Cronometro**: mostrato solo mentre la partita è in corso — il suo tempo trascorso attuale, lo
  stesso valore che legge la console della partita dal vivo.
- **Sede**: il nome della sede assegnata, quando la programmazione ne ha assegnata una.
- **Ultimo evento**: l'evento registrato più di recente, qualunque esso sia — questa scheda non tratta
  mai un tipo di evento come caso speciale, quindi una disciplina che ne dichiari uno nuovo (una
  conferma di revisione, una sostituzione) appare correttamente senza alcuna modifica a questa
  schermata.
- **Zona/posizione, oppure stato della serie** — mai entrambi sulla stessa scheda:
  - Un incontro in una fase a zone/gironi senza serie dichiarata mostra il nome della zona/girone
    (quando la fase dichiara più di un girone predefinito) e la posizione attuale di ciascun
    partecipante in classifica.
  - Un incontro risolto da una serie mostra il suo avanzamento e, una volta risolta, il suo stato
    complessivo — la stessa rappresentazione della serie già usata dal
    [tabellone pubblico](/help/control/series).
- **Fattore decisivo**: non viene mostrato sulla scheda. La classifica indica il criterio di spareggio sotto le righe che ha separato.
- **Pagina della partita**: aprendo una scheda si arriva alla pagina della partita, con ufficiali, formazioni e cronologia degli eventi. La cronologia indica il tempo di gioco di ogni evento e il punteggio dopo ogni gol; ogni tempo giocato si apre e si chiude con il suo punteggio. Le formazioni mostrano chi è iscritto prima del calcio d’inizio. Ogni partita di una serie ha la sua pagina, `?game=N`, raggiungibile dal tabellone.

## La traccia completa sulla scheda di controllo

La scheda pubblica non porta alcuna riga di spareggio. Un organizzatore con autorità sulla classifica interna di questo torneo (un admin, o un tournament-admin con autorità su di essa) vede la traccia completa del comparatore sulla versione di questa stessa scheda nel pannello di controllo, come la mostra già l’espansore della traccia della classifica interna. Uno spettatore non vede mai una traccia parziale.

## Cosa questa schermata NON fa

È di sola lettura. Nessuna scheda o controllo qui cambia lo stato di una partita, registra un evento,
né modifica il calendario — queste azioni restano sulla
[console della partita dal vivo](/help/control/match-console) e sul
[costruttore del calendario](/help/control/schedule). Questa schermata serve a osservare cosa sta
succedendo e cosa è già successo, non a gestire una partita.
