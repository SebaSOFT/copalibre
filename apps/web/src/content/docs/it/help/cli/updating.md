---
title: Aggiornamento
description: Il percorso non distruttivo per aggiornare il framework CopaLibre e i suoi moduli installati.
---

## Aggiornare il framework

Sequenza consigliata, non distruttiva:

1. **Esegui il backup** prima di toccare qualsiasi cosa: `./copalibre backup --file backups/pre-upgrade.dump`.
2. **Aggiorna** il checkout o il riferimento all'immagine alla nuova versione (non riavviare ancora
   i servizi).
3. **Verifica la compatibilità** con la nuova versione, senza riavviare nulla:
   ```bash
   ./copalibre upgrade-check --target-version <nuova-versione>
   ```
   Segnala se un modulo installato smetterebbe di essere compatibile con quella versione (lo stesso
   controllo che `module verify` usa contro la versione in esecuzione, ma contro la versione target),
   ed elenca le migrazioni di database in sospeso — senza applicarne nessuna. Termina con un codice
   di uscita diverso da zero se un modulo diventerebbe incompatibile; correggilo prima di
   continuare.
4. **Riavvia** con la nuova versione (`./copalibre start` o `docker compose up --detach --wait`). Le
   migrazioni in sospeso si applicano automaticamente, in ordine, prima che qualsiasi ruolo di
   processo inizi a servire traffico — non è un passaggio manuale separato.

## Aggiornare i moduli

Ogni disciplina o profilo torneo installato è un modulo versionato indipendentemente dal framework.

```bash
./copalibre module list --outdated
```

Elenca solo i moduli installati che hanno una versione pubblicata più recente di quella installata.

```bash
./copalibre module add <alias>@<intervallo>
```

Installa una versione specifica o un intervallo (ad esempio `@^2.0.0`) di un modulo già installato —
reinstallare con una versione diversa è il modo per aggiornare un modulo. Un torneo già avviato
continua a fare riferimento alla versione con cui è stato creato; aggiornare un modulo non cambia
mai retroattivamente un torneo già in corso.

Vedi il [riferimento comandi](/help/cli/commands/) per il resto delle opzioni di `module`.
