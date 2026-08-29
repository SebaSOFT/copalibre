---
title: Creazione torneo
description: Cosa configura la procedura guidata di creazione torneo e cosa significa ogni campo.
capabilities:
  - control-web/tournament-authoring
  - tournament-engine/discipline-driven-results
  - tournament-engine/tournament-fixture-engine
  - tournament-engine/tournament-profile
  - tournament-engine/tournament-domain-model
  - tournament-engine/competition-identity
  - tournament-engine/rules-engine
  - tournament-engine/scripting-hook-surface
  - tournament-engine/placement-stage-format
roles:
  - admin
---

## A cosa serve questa schermata

Crea un nuovo torneo all'interno dell'organizzazione: scegli la disciplina, il formato e i dati di
base prima che esista alcun partecipante iscritto.

## Campi chiave

- **Disciplina**: l'insieme di regole dello sport/attività da giocare (condizione di vittoria,
  punti, segmenti, ecc.). Compaiono solo le discipline installate su questa installazione — se manca
  quella di cui hai bisogno, installala prima (`copalibre module add`) prima di poter creare il
  torneo.
- **Alias**: l'identificatore del percorso pubblico del torneo, unico all'interno
  dell'organizzazione. Usa lettere minuscole e trattini; compare nell'URL pubblico e non può essere
  modificato liberamente in seguito.
- **Formato**: il formato di gioco disponibile per la disciplina scelta (eliminazione diretta, girone
  all'italiana, ecc.).

## Ciclo di vita

Un torneo appena creato parte in stato **bozza**. Da lì segue un percorso lineare: bozza →
pubblicato → avviato → concluso → archiviato. Ogni passaggio è una decisione esplicita su un'altra
schermata, mai qualcosa che questa schermata fa per te. Una volta **avviato**, la disciplina e il
profilo torneo si congelano alla versione che avevano in quel momento — un torneo in corso non
cambia mai le sue regole a metà strada.
