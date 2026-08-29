---
title: Amministrazione della piattaforma
description: Crea organizzazioni, gestisci i super-admin dell'installazione e installa moduli di disciplina/profilo.
capabilities:
  - control-web/platform-administration
  - platform/default-module-catalogue
roles:
  - super-admin
---

## A cosa serve questa schermata

Questa è la console propria dell'installazione, raggiungibile solo come `super-admin` — un livello
sopra qualsiasi organizzazione. Niente qui è limitato a una singola organizzazione: ogni azione qui
influisce sull'intera installazione.

## Organizzazioni

Una nuova organizzazione si crea qui — il suo alias, nome visualizzato, lingua principale e fuso orario
— e il suo primo amministratore viene invitato via email nello stesso passaggio. Un'organizzazione
creata senza un amministratore invitato resta senza nessuno che possa accedere e gestirla, per questo si
fanno insieme.

## Utenti

L'elenco utenti di qualsiasi organizzazione si raggiunge tramite il suo alias, così un super-admin può
entrare per cambiare il ruolo o lo stato di un utente senza dover essere membro di quell'organizzazione.

## Super-admin

I super-admin dell'installazione si elencano, creano e rimuovono qui. Un super-admin si crea tramite ID
principale — l'identità deve già esistere (aver effettuato l'accesso almeno una volta) prima di poter
essere promossa.

## Moduli

I moduli di disciplina e di profilo torneo si installano qui tramite alias, un intervallo di versione
opzionale e una fonte alternativa opzionale per un modulo non presente nel catalogo predefinito. I
moduli installati sono elencati con tipo, versione e fonte, e possono essere verificati o rimossi.
Controllare gli aggiornamenti confronta le versioni installate con ciò che la fonte di ogni modulo
pubblica attualmente, senza installare nulla finché non viene richiesto.

## Cosa non puoi fare qui

Niente qui raggiunge i dati propri di torneo di un'organizzazione — nessuna partita, risultato o
iscrizione è visibile o modificabile da questa schermata. Quello è il pannello di controllo proprio di
ogni organizzazione, raggiunto da un amministratore di organizzazione, non da un super-admin che agisce
da questa console.
