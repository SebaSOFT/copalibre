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

## Cosa vede uno spettatore sul sito pubblico

Il sito pubblico (senza accesso) mostra le classifiche, il tabellone e i report partita di un torneo
così come vengono pubblicati, allo stesso indirizzo organizzazione/torneo usato dal pannello di
controllo e dalle superfici `/tv/**`. Una [serie](/help/control/series) in corso mostra il proprio
punteggio dal vivo e quale parte sta vincendo sul tabellone pubblico nello stesso modo del pannello di
controllo, e una partita non ancora programmata è mostrata come tale, mai indovinata.

## Cosa non puoi fare qui

Nessuna delle due superfici accetta input da uno spettatore o da un dispositivo TV: entrambe sono
rappresentazioni di sola lettura di dati già pubblicati. Cambiare ciò che viene pubblicato avviene nel
pannello di controllo proprio dell'organizzazione, non sulle superfici pubbliche né su quelle `/tv/**`.
