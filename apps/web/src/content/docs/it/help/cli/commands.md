---
title: Riferimento comandi
description: Ogni comando del CLI copalibre, il suo uso e le sue opzioni.
---

Ogni comando risponde a `--help`/`-h` con esattamente questo testo d'uso, generato da un'unica
fonte all'interno del CLI stesso — questa pagina non può descrivere un comando in modo diverso da
quello che il CLI realmente fa.

## init

`copalibre init [--file <percorso>]`

Scrive i valori predefiniti non segreti ed elenca i segreti richiesti.

- `--file <percorso>`: file di destinazione (predefinito `.env`)

## doctor

`copalibre doctor [--check-proxy] [--proxy-url <url>]`

Valida configurazione e dipendenze prima di avviare.

- `--check-proxy`: verifica anche la configurazione del proxy inverso
- `--proxy-url <url>`: URL pubblico da testare quando si usa `--check-proxy`

## dev

`copalibre dev [--hybrid]`

Esegue un ambiente di sviluppo, containerizzato o ibrido.

- `--hybrid`: infrastruttura in Docker, processi applicativi sull'host

## start

`copalibre start`

Avvia PostgreSQL, esegue doctor, e avvia tutti i ruoli di processo.

## migrate

`copalibre migrate`

Esegue le migrazioni di database in sospeso.

## backup

`copalibre backup [--file <percorso>] [--retain <n>] [--dry-run]`

Crea un **pacchetto di backup** compresso (`.tar.gz`) sotto `backups/`, con il dump di PostgreSQL e
un manifesto (data e versione di CopaLibre). Applica la retention: dopo un backup riuscito, elimina i
pacchetti più vecchi oltre `--retain`. Elimina solo i file corrispondenti al pattern di nome del
pacchetto (`copalibre-<data>.tar.gz`) — non tocca mai nessun altro file sotto `backups/`.

- `--file <percorso>`: destinazione del pacchetto, dentro `backups/` (predefinito: un nome con
  timestamp)
- `--retain <n>`: pacchetti da conservare dopo questo backup (predefinito: 5)
- `--dry-run`: stampa il piano di backup senza eseguirlo

I dati dei moduli installati (descrittori di disciplina, profili torneo) risiedono in PostgreSQL,
quindi sono inclusi nel dump. I byte degli oggetti nello storage oggetti (`object-storage-data`)
sono fuori dall'ambito di questo comando — eseguine il backup separatamente a livello di
infrastruttura, come già indica la guida all'autogestione.

## restore

`copalibre restore --file <percorso> (--confirm | --dry-run) [--allow-newer-backup]`

Estrae un pacchetto di backup, ripristina il suo dump PostgreSQL, esegue le migrazioni in sospeso e
conferma che lo schema applicato corrisponda a questa installazione — tutto in un'unica invocazione.

- `--file <percorso>`: pacchetto da ripristinare, dentro `backups/`
- `--confirm`: richiesto per eseguire realmente il ripristino
- `--dry-run`: stampa il piano di ripristino senza eseguirlo
- `--allow-newer-backup`: consente di ripristinare un pacchetto prodotto da una versione di
  CopaLibre più recente di quella attualmente in esecuzione (rifiutato per impostazione predefinita)

Dopo un `pg_restore` riuscito, `restore` esegue automaticamente `copalibre migrate` e quindi apre
una connessione per verificare che la versione dello schema applicato corrisponda esattamente a
quella che questa installazione si aspetta (lo stesso controllo che usa `GET /ready`) — così un
ripristino non lascia mai silenziosamente il codice e il database disallineati. Se la migrazione
fallisce, `restore` lo segnala con il suo codice di uscita senza dichiarare successo; riprova con
`copalibre migrate` e poi `copalibre doctor`.

Un pacchetto il cui manifesto registra una versione di CopaLibre più recente di quella attualmente
in esecuzione viene rifiutato prima di toccare il database, nominando entrambe le versioni —
aggiorna prima questa installazione, oppure passa `--allow-newer-backup` se intendi davvero
procedere.

## upgrade-check

`copalibre upgrade-check --target-version <semver>`

Verifica la compatibilità dei moduli installati e le migrazioni in sospeso prima
dell'aggiornamento.

- `--target-version <semver>`: versione di CopaLibre contro cui verificare moduli e migrazioni

Termina con un codice di uscita diverso da zero se un modulo installato smetterebbe di essere
compatibile con la versione target. Vedi [aggiornamento](/it/help/cli/updating/) per la sequenza
completa.

## create-admin

`copalibre create-admin --organization-alias <alias> --organization-name <nome> --email <email>`

Crea il primo account amministratore di un'organizzazione.

## module

`copalibre module <add|list|remove|verify>`

Gestisce i moduli di disciplina e profilo torneo installati.

### module add

`copalibre module add <alias>[@intervallo] [--source <url>] [--allow-unsatisfied-capabilities]`

Installa un modulo tramite alias, opzionalmente fissato a un intervallo di versione.

- `--source <url>`: una fonte alternativa esplicitamente abilitata, invece di quella curata
- `--allow-unsatisfied-capabilities`: installa anche se le capacità richieste dichiarate non sono
  ancora soddisfatte

### module list

`copalibre module list [--outdated]`

Elenca i moduli installati, o solo quelli con una versione pubblicata più recente.

- `--outdated`: mostra solo i moduli con una versione pubblicata più recente

### module remove

`copalibre module remove <alias>`

Rimuove un modulo installato che nessun torneo avviato referenzia.

### module verify

`copalibre module verify`

Rivalida ogni modulo installato contro la versione del core in esecuzione.

### module scaffold

`copalibre module scaffold <discipline|tournament-profile> <alias> [--author <nome>] [--licence <licenza>] [--name <nome>] [--source-url <url>] [--output <dir>]`

Genera un pacchetto modulo strutturalmente valido per iniziare la creazione — inizializzato da uno
dei documenti già validi del catalogo CopaLibre, non un'ipotesi cieca dello schema — come
repository Git locale etichettato, pronto per essere modificato, validato e installato/inviato.

- `--author <nome>`: autore dell'attribuzione (predefinito: Unknown)
- `--licence <licenza>`: identificatore SPDX (predefinito: AGPL-3.0-only)
- `--name <nome>`: nome di distribuzione (predefinito: l'alias)
- `--source-url <url>`: URL sorgente dell'attribuzione
- `--output <dir>`: dove scrivere il repository del modulo (predefinito: `modules/<alias>`)

### module validate-local

`copalibre module validate-local <percorso>`

Valida un pacchetto modulo locale senza cercarlo né installarlo — lo stesso controllo che `module
add`/`module verify` applicano già.

### module submit

`copalibre module submit <percorso> [--upstream <owner/repo>] [--base <branch>]`

Esegue il fork di `copalibre-modules`, copia il modulo locale su un nuovo branch, lo pubblica, e
apre una pull request.

- `--upstream <owner/repo>`: repository di destinazione (predefinito: `SebaSOFT/copalibre-modules`)
- `--base <branch>`: branch base della pull request (predefinito: `main`)

## mcp

`copalibre mcp`

Avvia un server locale Model Context Protocol (MCP) su stdio, affinché un'IA possa gestire
CopaLibre. Vedi il [dettaglio degli strumenti MCP](/it/help/cli/mcp/).
