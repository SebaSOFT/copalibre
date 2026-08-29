---
title: Importazione ed esportazione
description: Importazione CSV in blocco dei partecipanti, ed esportazione CSV/JSON di partecipanti, risultati, classifiche e configurazione del torneo.
capabilities:
  - control-web/data-import-export
roles:
  - admin
---

## Importazione

I partecipanti si importano in blocco tramite CSV dalla schermata di
[revisione iscrizioni](/help/control/registration-review). Ogni riga viene convalidata prima che venga
scritto qualcosa: una riga che fallisce la convalida viene segnalata con il proprio numero di riga e
motivo, e nessuna riga viene importata finché l'intero file non viene accettato, oppure corretto e
ricaricato — un file parzialmente importato non è uno stato che questa schermata produce. Un CSV
esportato in precedenza da questa stessa installazione si reimporta senza problemi, quindi far fare un
giro completo a un elenco di partecipanti (modificarlo in un foglio di calcolo, riportarlo indietro) è un
percorso supportato, non un incidente.

## Esportazione

- **Partecipanti**: rose individuali o di squadra, per alias — raggiungibile da
  [revisione iscrizioni](/help/control/registration-review).
- **Risultati e classifiche**: i risultati calcolati e la tabella delle classifiche di una fase, per
  alias — raggiungibile da [classifiche](/help/control/standings).
- **Configurazione del torneo**: il regolamento completo, le sovrascritture e gli script personalizzati
  in JSON, dal pannello dell'organizzazione — lo stesso documento che un'installazione nuova potrebbe
  reimportare per riprodurre le regole del torneo, non i suoi risultati.

Ogni esportazione sostituisce un identificatore interno del database con l'alias pubblico dell'entità,
quindi un file esportato non fa mai trapelare un identificatore che nulla al di fuori
dell'installazione dovrebbe vedere.

## Cosa non puoi fare qui

Importare risultati o classifiche non è supportato — questi sono calcolati, non digitati, e l'unico modo
per modificarne uno in seguito è il [flusso di correzione controllato](/help/control/corrections).
