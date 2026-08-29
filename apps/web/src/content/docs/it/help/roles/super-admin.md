---
title: Super-admin
description: Cosa può fare il ruolo super-admin, e cosa non può fare.
capabilities:
  - control-web/platform-administration
roles:
  - super-admin
---

## A cosa serve questo ruolo

L'operatore dell'installazione stessa — un livello sopra ogni organizzazione, senza essere membro di
nessuna di esse. Super-admin esiste per creare organizzazioni, gestire chi altro detiene super-admin, e
installare i moduli di disciplina e profilo torneo che tutta l'installazione esegue.

A differenza di ogni altro ruolo di questo sito, super-admin si trova interamente al di fuori della
corrispondenza di capacità di organizzazione: è un ruolo di installazione (`INSTALLATION_ROLES`), non un
ruolo di organizzazione (`ORGANIZATION_ROLES`), quindi non ha alcuna voce nella corrispondenza
dichiarata da ruolo a capacità né una lista di capacità generata qui — la sua autorità è un insieme
fisso e ristretto di azioni a livello di installazione, descritte direttamente.

## Cosa può fare

- Creare una nuova organizzazione, nominandone alias, nome visualizzato, lingua principale e fuso
  orario, e invitare il suo primo amministratore nello stesso passaggio.
- Elencare, creare e rimuovere super-admin di installazione, per ID principale.
- Accedere all'elenco utenti di qualsiasi organizzazione, per alias, per cambiare ruolo o stato di un
  utente — senza bisogno di appartenenza a quell'organizzazione.
- Installare un modulo di disciplina o profilo torneo per alias, un intervallo di versione opzionale, e
  una fonte alternativa opzionale; elencare, verificare, rimuovere, e controllare aggiornamenti dei
  moduli installati.
- Creare una nuova disciplina o un nuovo profilo torneo tramite la procedura guidata di amministrazione
  della piattaforma, producendo un pacchetto di modulo che quella stessa autorità di installazione poi
  installa.

## Cosa non può fare

Nulla raggiunge i dati propri di torneo di un'organizzazione: nessun fixture, risultato o iscrizione è
visibile o modificabile tramite questo ruolo. Questo appartiene al pannello di controllo proprio di
ogni organizzazione, raggiunto da un [admin](/it/help/roles/admin/), non da super-admin che agisce
tramite la console di installazione.

## Schermate che vede

La schermata di amministrazione della piattaforma, e nessun'altra schermata del pannello di controllo —
le schermate limitate a un'organizzazione appartengono a un ruolo di organizzazione, che super-admin
non detiene semplicemente essendo super-admin.
