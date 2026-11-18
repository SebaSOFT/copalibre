---
title: Riferimento comandi
description: Ogni comando del CLI copalibre, il suo uso e le sue opzioni.
capabilities:
  - platform/cli-tournament-operations
  - platform/url-routing-contract
roles:
  - super-admin
  - admin
---

Ogni comando risponde a `--help`/`-h` con esattamente questo testo d'uso, generato da un'unica
fonte all'interno del CLI stesso — questa pagina non può descrivere un comando in modo diverso da
quello che il CLI realmente fa. `copalibre --version` stampa solo la versione installata, per gli
script.

## init

`copalibre init [--module-dev]` oppure `copalibre init --kubernetes [--namespace <ns>] [--release
<nome>] [--context <ctx>]`

Scrive un'installazione completa nella directory corrente. Non richiede un checkout del sorgente:
eseguilo in qualsiasi directory vuota, e ogni comando successivo rileva automaticamente quella
directory dal marcatore (`.copalibre/installation.json`) che scrive, allo stesso modo in cui `.git`
contrassegna un checkout di repository. Si rifiuta di essere eseguito di nuovo in una directory che
contiene già un'installazione. Una directory resta fissata alla versione di CopaLibre con cui `init`
l'ha creata — eseguire più versioni fianco a fianco significa eseguire la versione di CLI
corrispondente per directory (vedi [aggiornamento](/it/help/cli/updating/)).

Senza `--kubernetes`, scrive `docker-compose.yml` e `.env` con valori predefiniti non segreti, ed
elenca i segreti richiesti da completare successivamente in `.env`.

- `--module-dev`: scrive anche `docker-compose.module-dev.yml` e una directory `modules-dev/`,
  montata in `api`/`worker` con `COPALIBRE_MODULE_SOURCE_ALLOWLIST` preconfigurato — si combina con
  `module scaffold --output modules-dev/<alias>` e `module add <alias> --source
file:///var/lib/copalibre/modules-dev/<alias>` per sviluppare un modulo contro un'istanza
  self-hosted in esecuzione, senza checkout del sorgente.

Con `--kubernetes`, scrive invece uno scaffold `values.yaml` di Helm — nessun file compose, nessun
`.env`; il meccanismo Secret/ConfigMap proprio di Kubernetes resta autoritativo per la
configurazione. Flusso completo, incluso il bootstrap del primo amministratore come Job Helm
monouso: `docs/deployment/enterprise-kubernetes.md` nel repository.

- `--kubernetes`: crea lo scaffold di un'installazione Helm invece di una Compose
- `--namespace <ns>`: namespace Kubernetes da registrare (predefinito: `default`)
- `--release <nome>`: nome della release Helm da registrare (predefinito: `copalibre`)
- `--context <ctx>`: kube-context da registrare (predefinito: nessuno — passalo esplicitamente ogni
  volta)

Opzioni di identità:

- `--oidc-issuer <url>`: accesso tramite un provider OIDC esterno con questo emittente esatto (`iss`). Senza questa opzione, CopaLibre usa il proprio provider integrato. `init` scrive anche l'origine dell'emittente in `COPALIBRE_CSP_IDENTITY_ORIGIN`, così la politica di sicurezza dei contenuti consente l'accesso.
- `--oidc-client-id <id>`: ID client registrato per CopaLibre presso il provider. Obbligatorio con `--oidc-issuer`.
- `--oidc-jwks-uri <url>`: insieme di chiavi del provider (predefinito: letto dal suo documento di discovery OpenID).

In modalità interattiva, `init` chiede se usi un provider esterno e poi chiede questi valori.

Opzioni dei cookie di sessione:

- `--https`: i browser raggiungono l'installazione via HTTPS, quindi i cookie di sessione hanno `Secure` e il prefisso `__Host-`.
- `--no-https`: HTTP semplice su un host diverso da `localhost`; i cookie omettono `Secure`. Rifiutato con un `--app-url` `https`.

Senza nessuno dei due, `init` ricava `COPALIBRE_SESSION_COOKIE_SECURE` dallo schema di `--app-url` (`localhost` conta come sicuro). In modalità interattiva chiede se si usa HTTPS.

Opzioni email e riparazione:

- `--repair`: crea backup di `.env` e `docker-compose.yml`, aggiunge valori e risorse mancanti e preserva il Compose esistente. I servizi predefiniti assenti vengono mostrati con snippet YAML da verificare e applicare manualmente.
- `--email-provider <provider>`: `smtp`, `resend`, `brevo` o `mailgun` (predefinito: SMTP locale).
- `--email-from <address>`: indirizzo mittente (predefinito: `noreply@copalibre.local`, da cui nessun servizio di posta invia; `doctor` lo segnala finché non ne imposti uno reale).
- `--email-credential <value>`: URL di connessione SMTP o chiave API del provider.
- `--email-domain <domain>`: obbligatorio per Mailgun.
- `--email-region <us|eu>`: la regione Mailgun che ospita il dominio (predefinita: `us`).

In modalità interattiva, `init` chiede l'email come `doctor`: elenca i provider per numero, legge la chiave API o la password SMTP senza mostrarla e chiede il mittente. Invio mantiene i valori di prova locali. Un'opzione già passata non viene richiesta di nuovo.

## doctor

`copalibre doctor [--check-proxy] [--proxy-url <url>] [--smoke] [--fix | --interactive] [--non-interactive] [--send-test-email <address>]`
oppure `copalibre doctor --configure <email|bootstrap-token|public-url> [opzioni dell'impostazione]`

Valida configurazione e dipendenze prima di avviare e propone di completare le impostazioni che mancano all'installazione.

- `--check-proxy`: verifica anche la configurazione del proxy inverso
- `--proxy-url <url>`: URL pubblico da testare quando si usa `--check-proxy`
- `--smoke`: verifica da capo a capo il gateway, il JWKS di autenticazione, le organizzazioni e il flusso SSE
- `--fix`, `--interactive`: dopo il rapporto, percorre con domande ogni torneo con uno stato non canonico (scegliere lo stato, confermare, applicare). Richiede un terminale.

### Impostazioni che doctor completa

Doctor trova le impostazioni che mancano a un'installazione e, in un terminale, propone di completarle. `copalibre upgrade` termina eseguendo doctor, quindi anche un'installazione aggiornata riceve queste domande.

- **Email** (`email`): il mittente `noreply@copalibre.local`, scritto per impostazione predefinita da ogni versione, è segnalato come avviso: nessun servizio di posta invia da un indirizzo `.local`, quindi inviti e reimpostazioni della password non arrivano mai. Un provider senza la sua chiave API o il suo URL SMTP è un errore. Doctor chiede quale servizio invia le email (SMTP, Resend, Brevo o Mailgun, per numero), poi i dati di connessione: per SMTP server, porta, utente e password, oppure un URL `smtp://` completo; per gli altri la chiave API e, per Mailgun, il dominio di invio e la sua regione. I segreti non vengono mostrati durante la digitazione. Poi chiede l'indirizzo mittente.
- **Token di avvio** (`bootstrap-token`): un `COPALIBRE_BOOTSTRAP_TOKEN` di esempio viene sostituito con uno casuale, previa conferma. Nient'altro lo conserva, quindi nulla si rompe.
- **URL pubblico** (`public-url`): un'installazione creata con la 1.0 manda i browser al servizio web sulla porta 4321. Doctor propone di spostare `COPALIBRE_APP_URL` (e `COPALIBRE_API_URL`, e l'emittente quando indicava lo stesso indirizzo) sul gateway, la porta 8080 per impostazione predefinita, o all'indirizzo del tuo proxy.

Doctor scrive solo le chiavi configurate, conserva il file precedente come `.env.<data>.bak`, lascia `.env` leggibile solo dal proprietario ed elenca le chiavi cambiate senza i loro valori. Dopo l'email propone un'email di prova, poi il riavvio dei servizi che leggono la modifica, e ricontrolla.

Doctor non riscrive mai una password che il database o un servizio in esecuzione conserva: per un `POSTGRES_PASSWORD` di esempio mostra il comando che cambia la password nel database, da eseguire prima di modificare `.env`.

- `--non-interactive`: non chiede nulla, nemmeno in un terminale. Senza terminale (uno script o un job di CI) doctor non chiede mai: mostra le opzioni qui sotto.
- `--configure <setting>`: configura `email`, `bootstrap-token` o `public-url` senza domande, poi verifica. Per `email` passa `--email-provider`, `--email-credential`, `--email-from` e, per Mailgun, `--email-domain` e `--email-region` (le stesse opzioni di `init`). Per `public-url`, `--app-url <url>`. Un valore scritto sulla riga di comando resta nella cronologia della shell; leggilo da un file, per esempio `--email-credential "$(cat resend-key.txt)"`.
- `--send-test-email <address>`: invia un'email con il provider e la configurazione dell'applicazione, dall'interno dello stack, e riporta la risposta del provider (una chiave API errata mostra il motivo del provider).

## dev

`copalibre dev [--hybrid]`

Esegue un ambiente di sviluppo, containerizzato o ibrido.

- `--hybrid`: infrastruttura in Docker, processi applicativi sull'host

### dev demo

`copalibre dev demo [--list] [<dataset>] [--anchor <YYYY-MM-DD|today>] [--played-until <ISO-8601|now>]`

Carica un dataset dimostrativo versionato (per esempio `panamericano-clubes-2025`, un campionato di
hockey su pista di 24 club con gironi, coppe, calendario, risultati e stemmi) nell'ambiente di
sviluppo in esecuzione. Eseguilo dal tuo checkout con l'ambiente avviato (`copalibre dev`). La
disciplina `rink-hockey` deve essere già installata; il caricamento non installa mai moduli e un
dataset già caricato non viene modificato. I cognomi dei giocatori sono generati, non reali.

- `--list`: mostra i dataset disponibili ed esce
- `--anchor <YYYY-MM-DD|today>`: sposta la prima giornata a quella data; ogni partita mantiene l'ora locale e la distanza in giorni dalla prima giornata. `today` è oggi nel fuso orario dell'organizzazione
- `--played-until <ISO-8601|now>`: gioca solo le partite terminate entro quel momento; le altre restano in calendario nel loro turno, e le partite di coppa i cui partecipanti ne dipendono restano da definire. Un istante indica il suo scostamento, per esempio `2026-10-18T15:00:00-03:00`
- `copalibre dev demo panamericano-clubes-2025 --anchor today --played-until now` carica un torneo in corso
- azzera i dati dimostrativi con `docker compose -f docker-compose.dev.yml down -v`; un dataset già caricato viene saltato, opzioni comprese

## start

`copalibre start [--dev]`

Avvia PostgreSQL, esegue doctor e poi avvia tutti i ruoli di processo. In un’installazione Kubernetes mostra istruzioni Helm. Con --dev avvia il profilo di sviluppo containerizzato.

## stop

`copalibre stop [--dev] [--down]`

Arresta i container Compose senza rimuovere i volumi. --down rimuove container e reti. In modalità Kubernetes mostra istruzioni kubectl/Helm. --dev gestisce solo Compose, non i processi Yarn avviati sull’host.

## restart

`copalibre restart [--dev] [--no-doctor]`

Arresta Compose, avvia PostgreSQL, esegue doctor e poi riavvia gli altri servizi attendendo la salute. --no-doctor salta doctor; --dev riavvia i profilo infrastrutturale Compose di sviluppo.

## status

`copalibre status [--json] [--dev]`

Mostra stato dei container, porte di ingresso pubblicate e salute del gateway. --json produce JSON leggibile dalle macchine e --dev controlla Compose di sviluppo. In Kubernetes mostra release, namespace e contesto e interroga i pod se kubectl è disponibile.

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
quella che questa installazione si aspetta (lo stesso controllo che usa `GET /api/ready`) — così un
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

## upgrade

`copalibre upgrade [--check] [--target-version <v>] [--self] [--skip-self-update] [--skip-services] [--skip-modules] [--keep-old-volume] [--yes]`

Porta l'installazione della directory corrente a una nuova versione. Legge che cosa contiene
l'installazione (la versione che ha distribuito il suo file Compose, la sua versione di PostgreSQL, il
suo `.env`), non solo il suo marcatore; scarica le nuove immagini; ferma lo stack e fa il backup del
database; sostituisce i file Compose e del gateway distribuiti da una versione, conservando copie
`.bak`; sposta i dati da PostgreSQL 17 a 18 e confronta le righe di ogni tabella; avvia la nuova
versione; esegue `doctor`; e, quando doctor passa, rimuove volume e immagine di PostgreSQL 17. Un file
Compose che avete modificato lo ferma prima di qualunque cambiamento. Un binario aggiornato da sé
prosegue l'aggiornamento. Vedi [aggiornamento](/it/help/cli/updating/).

- `--check`: mostra che cosa farebbe l'aggiornamento in questa directory, senza cambiare nulla
- `--target-version <v>`: versione di CopaLibre di destinazione (predefinita: l'ultima pubblicata)
- `--self`: aggiorna solo il binario del CLI, senza toccare Compose, immagini o servizi
- `--skip-self-update`: mantiene questo binario del CLI e aggiorna l'installazione con esso
- `--skip-services`: aggiorna solo `.env` e il marcatore; rifiutato se il database deve essere spostato
- `--skip-modules`: non elenca i moduli obsoleti alla fine
- `--keep-old-volume`: conserva volume e immagine di PostgreSQL 17 dopo lo spostamento dei dati
- `--yes`, `-y`: esegue l'aggiornamento senza chiedere conferma

## create-admin

`copalibre create-admin --organization-alias <alias> --organization-name <nome> --email <email>`

Crea il primo account amministratore di un'organizzazione.

L'alias non può essere un nome che la piattaforma usa già nei suoi indirizzi, come `login`, `platform`,
`tv`, `api` o un codice di lingua come `es`; in quel caso il comando lo rifiuta e spiega perché.

## grant-first-super-admin

`copalibre grant-first-super-admin --email <email>`

Concede il ruolo di super-admin a un account che esiste già, e solo finché l'installazione non ne ha
nessuno attivo. Ogni altro modo di concederlo richiede già un super-admin, quindi questa è la strada
verso il primo.

La persona deve avere un account: ha accettato un invito o ha effettuato l'accesso una volta. Il
comando legge `DATABASE_URL`, quindi eseguilo dove il database è raggiungibile. La concessione ha
effetto al prossimo accesso. Se un super-admin è già attivo, il comando rifiuta, lo dice e registra il
tentativo nel registro di audit; da quel momento i super-admin si gestiscono dalla schermata di
piattaforma del pannello di controllo.

## login

`copalibre login [--api-url <url>] [--token <token>]`

Memorizza un token di accesso personale in modo che `statistics-rebuild` e
`module add/list/remove/verify` possano funzionare contro un'installazione remota tramite una
connessione HTTP autenticata — il percorso per amministrare un'installazione già in esecuzione,
incluso installare o aggiornare il CLI dopo che Docker è già avviato, da una macchina che non ha mai
bisogno di credenziali del database. Genera il token dalla schermata delle preferenze del pannello
di controllo mentre sei già connesso, poi incollalo qui. Convalida il token con una chiamata
autenticata prima di memorizzarlo; rifiuta e non memorizza nulla se il token non è valido.

- `--api-url <url>`: installazione di destinazione (predefinito: `COPALIBRE_API_URL`, che
  `copalibre init` scrive già in `.env`)
- `--token <token>`: il token stesso (predefinito: letto da stdin se in pipe, oppure un prompt
  interattivo che maschera ogni tasto)

Memorizza la credenziale in `.copalibre/credentials.json` (`0600`) della directory corrente —
esegui `login` dall'interno della directory di installazione creata da `copalibre init`.
Rieseguire `login` nella stessa directory sostituisce il token memorizzato, a differenza del
marcatore di `init`.

## statistics-rebuild

`copalibre statistics-rebuild --organization <alias> [--tournament <alias>]`

Ricalcola ogni totale statistico ripiegato (`statistic_totals`) a partire dai fatti sorgente —
eventi registrati delle partite finalizzate, rose e regolazioni manuali — per l'intera
organizzazione per impostazione predefinita, o limitato a un torneo.

- `--organization <alias>`: organizzazione per cui ricalcolare le statistiche
- `--tournament <alias>`: limita il ricalcolo a un torneo all'interno dell'organizzazione

Idempotente: usa lo stesso `refold` e lo stesso percorso di scrittura elimina-poi-inserisci del
trigger guidato dagli eventi, quindi eseguirlo due volte di seguito produce righe di
`statistic_totals` identiche byte per byte (a parte `updated_at`/la versione interna di
proiezione). Utile per completare la cronologia registrata prima che esistesse il motore di
ripiegamento, o per verificare i totali contro i fatti in qualsiasi momento. Richiede l'autorità di
amministratore dell'organizzazione dopo l'accesso tramite [`login`](#login).

## module

`copalibre module <add|list|remove|verify>`

Gestisce i moduli di disciplina e profilo torneo installati. `add`/`list`/`remove`/`verify`
richiedono l'autorità di super-admin dell'installazione dopo l'accesso tramite [`login`](#login).

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

## organization add-admin

`copalibre organization add-admin --organization <alias> --email <email>`

Crea un invito amministratore verificabile per un'organizzazione esistente. Il comando si collega direttamente al database: usalo solo da un ambiente operativo attendibile configurato con `DATABASE_URL` e `COPALIBRE_APP_URL`. Non crea account né password; la persona invitata imposta la password tramite il normale flusso di accettazione. Il link di configurazione viene mostrato una sola volta.

## dev demo --with-admin

`copalibre dev demo panamericano-clubes-2025 --with-admin <email>`

Dopo aver caricato il dataset dimostrativo, crea un invito amministratore verificabile per `panamericano-demo` e mostra il link una sola volta. L'opzione è disponibile solo per la demo Panamericano.
