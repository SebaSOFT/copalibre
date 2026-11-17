---
title: Aggiornamento
description: Il percorso non distruttivo per aggiornare il framework CopaLibre e i suoi moduli installati.
capabilities: []
roles:
  - super-admin
---

## Aggiornare il CLI copalibre stesso

`copalibre --version` stampa la versione del binario installato. Rieseguire lo script di
installazione scarica l'ultima release pubblicata e sostituisce il binario al suo posto — è
idempotente: controlla prima la versione installata e salta il download se corrisponde già:

```bash
curl -fsSL https://github.com/SebaSOFT/copalibre/releases/latest/download/install.sh | bash
```

Questo sostituisce solo il binario `copalibre`. Non ha effetto su un'installazione in esecuzione —
vedi sotto per aggiornare il framework e i suoi moduli.

## Aggiornare il framework

Eseguite `copalibre upgrade` nella directory dell'installazione, con il CLI della versione verso cui
passate. Prima guardate che cosa farà; non cambia nulla:

```bash
copalibre upgrade --check
```

### Da dove partite

| La vostra installazione è stata creata da        | Fate così                                                                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 1.2.5 o 1.2.6                                    | `copalibre upgrade --self`, poi `copalibre upgrade --check` e `copalibre upgrade`                                       |
| 1.2.1 o precedente (il suo CLI non ha `upgrade`) | Installate il nuovo CLI con lo script di installazione qui sopra, poi `copalibre upgrade --check` e `copalibre upgrade` |
| Un CLI 1.2.x ha già eseguito `copalibre upgrade` | Installate il nuovo CLI ed eseguite di nuovo `copalibre upgrade`                                                        |

Non lasciate che un CLI 1.2.x esegua `copalibre upgrade` da solo. Scrive la nuova versione in
`.env`, `docker-compose.yml` e `.copalibre/installation.json`, segnala successo e lascia tutti i
container sulle immagini vecchie; al riavvio successivo le immagini nuove partono sul vecchio file
Compose, e non funziona. Il nuovo CLI riconosce un'installazione lasciata così, qualunque cosa dica il
suo marcatore, e completa il lavoro.

### Che cosa fa l'aggiornamento

1. Scarica le nuove immagini mentre l'installazione continua a funzionare, così nulla si ferma se ne
   manca una.
2. Ferma lo stack, per non perdere nessuna scrittura, e fa il backup del database in
   `backups/pre-upgrade-<da>-to-<a>-<data>.tar.gz`.
3. Sostituisce `docker-compose.yml` e `deploy/gateway/Caddyfile` con quelli della nuova versione,
   quando sono ancora come una versione li ha distribuiti, e conserva i precedenti come
   `docker-compose.yml.<da>.bak` e `deploy/gateway/Caddyfile.<da>.bak`. Aggiorna `.env` (nuove
   impostazioni, nuove etichette delle immagini, l'indirizzo del set di chiavi spostato sotto `/api`)
   e conserva `.env.<da>.bak`; i valori che avete impostato restano.
4. Sposta il database da PostgreSQL 17 a 18: ripristina il backup in un nuovo volume
   (`postgresql-data`) e confronta il numero di righe di ogni tabella prima di proseguire. Il volume
   17 non viene toccato.
5. Avvia la nuova versione ed esegue `copalibre doctor`.
6. Quando doctor passa, verifica che il backup si possa rileggere, poi rimuove il volume di
   PostgreSQL 17 (`postgres-data`) e l'immagine `postgres:17`. Con `--keep-old-volume` vengono
   conservati; l'aggiornamento stampa i due comandi per rimuoverli in seguito.

Lo stack è fermo dal passo 2 finché il passo 5 riesce; pianificate la finestra in base alla
dimensione del database. Lo spostamento richiede spazio libero per una seconda copia del database:
senza, l'aggiornamento non parte. A fine aggiornamento copiate il pacchetto di backup fuori dall'host.

### Se avete modificato docker-compose.yml

Un file Compose che non corrisponde a nessuna versione (un servizio aggiunto, un valore cambiato)
resta com'è. L'aggiornamento scrive il file della nuova versione come `docker-compose.yml.new`, lo
segnala e si ferma prima di cambiare qualunque altra cosa. Riportate le vostre modifiche in quel file,
sostituite `docker-compose.yml` con il risultato ed eseguite di nuovo `copalibre upgrade`. Una
configurazione del gateway che avete modificato viene conservata, e l'aggiornamento lo dice.

### Installazioni 1.0

La 1.0 non aveva gateway: il proxy di frontiera raggiungeva direttamente `web`, `api` ed `events`.
Dalla 1.1 il servizio `gateway` è l'unico ingresso, su `COPALIBRE_PORT` (8080 se non impostato). Dopo
l'aggiornamento puntate il proxy al gateway e impostate `COPALIBRE_APP_URL` sull'indirizzo che usano i
browser; eseguite `copalibre doctor` per conferma.

### Tornare indietro

Se un passo prima di doctor fallisce, l'aggiornamento rimette i file precedenti, avvia la versione
precedente sul suo volume PostgreSQL 17 intatto e spiega perché si è fermato. Se fallisce doctor, la
nuova versione resta in esecuzione e l'aggiornamento stampa questi passi senza rimuovere nulla.

Finché il volume di PostgreSQL 17 esiste (doctor è fallito, oppure avete usato `--keep-old-volume`):

```bash
docker compose down
cp docker-compose.yml.<da>.bak docker-compose.yml
cp .env.<da>.bak .env
cp deploy/gateway/Caddyfile.<da>.bak deploy/gateway/Caddyfile   # se l'aggiornamento lo ha sostituito
docker compose up --detach --wait
```

Il volume di PostgreSQL 18 (`<progetto>_postgresql-data`) resta inutilizzato; rimuovetelo con
`docker volume rm` prima di riprovare l'aggiornamento se volete ripartire da zero.

Dopo che l'aggiornamento ha rimosso PostgreSQL 17, la via del ritorno è il pacchetto di backup.
Installate il CLI della versione precedente in una directory nuova e vuota, eseguite lì
`copalibre init`, copiate il pacchetto nella sua `backups/` e ripristinatelo:

```bash
copalibre restore --file backups/pre-upgrade-<da>-to-<a>-<data>.tar.gz --confirm
```

Le scritture successive all'aggiornamento vanno perse. Tornare a immagini precedenti sul database già
migrato non è mai un ritorno sicuro.

### Procedura manuale con Compose (tra versioni 2.x)

Da un'installazione 1.x usate `copalibre upgrade`: il suo database deve passare a PostgreSQL 18, cosa
che questi passi non fanno.

Conserva il CLI corrispondente a `.copalibre/installation.json`. Sostituire il binario non aggiorna marcatore, Compose o immagini. Salva PostgreSQL, oggetti, configurazione e chiavi di firma; conserva le precedenti versioni delle immagini.

```bash
copalibre backup --file backups/pre-upgrade.tar.gz
```

Nella directory esistente, esamina le modifiche Compose/configurazione della versione destinazione e aggiorna entrambe le immagini in `.env`. Conserva progetto Compose e volumi. Scarica e verifica l’immagine senza avviare dipendenze né applicare migrazioni:

```dotenv
COPALIBRE_IMAGE=ghcr.io/sebasoft/copalibre:1.2.6
COPALIBRE_WEB_IMAGE=ghcr.io/sebasoft/copalibre-web:1.2.6
```

```bash
docker compose pull
docker compose run --rm --no-deps upgrade-check --target-version 1.2.6
```

Dopo la verifica, pianifica un’interruzione, arresta i processi applicativi e crea un backup finale; poi migra e riavvia. Non riavviare se la migrazione fallisce:

```bash
docker compose stop gateway web web-ssr api events worker scheduler
copalibre backup --file backups/pre-upgrade.tar.gz
docker compose run --rm migrate && docker compose up --detach --wait
docker compose run --rm doctor
```

Non cancellare né riscrivere il marcatore per aggirare il controllo di versione. Per operazioni di schema tra versioni usa i servizi Compose espliciti sopra; il nuovo CLI rifiuta `migrate` e `upgrade-check` con il vecchio marcatore. Una nuova directory `init` è un’altra installazione, non un aggiornamento sul posto.

Dopo una migrazione, selezionare immagini precedenti non è un rollback sicuro. Mantieni arrestati i processi di scrittura e ripristina i backup di PostgreSQL, oggetti e configurazione in un’installazione isolata della versione precedente. Verifica il recupero prima di spostare il traffico; le scritture successive al backup vanno perse.

## Aggiornamento per tipo di distribuzione

Con Compose dietro NGINX o Caddy, conserva proxy e certificati, usa la manutenzione durante la migrazione e valida/ricarica solo la configurazione modificata. Su Kubernetes, usa il chart destinazione con valori verificati ed entrambe le immagini, esegui prima un Job di compatibilità e verifica i Job di migrazione/doctor e l’ingress prima di riaprire il traffico. Helm rollback non annulla le migrazioni del database. Comandi dettagliati:

- [Caddy](https://github.com/SebaSOFT/copalibre/blob/main/docs/deployment/reverse-proxy/caddy.md#upgrading-copalibre-behind-caddy)
- [NGINX](https://github.com/SebaSOFT/copalibre/blob/main/docs/deployment/reverse-proxy/nginx.md#upgrading-copalibre-behind-nginx)
- [Kubernetes / Helm](https://github.com/SebaSOFT/copalibre/blob/main/docs/deployment/enterprise-kubernetes.md#upgrading-an-existing-helm-release-safely)

## Aggiornare i moduli

Ogni disciplina o profilo torneo installato è un modulo versionato indipendentemente dal framework.

```bash
copalibre module list --outdated
```

Elenca solo i moduli installati che hanno una versione pubblicata più recente di quella installata.

```bash
copalibre module add <alias>@<intervallo>
```

Installa una versione specifica o un intervallo (ad esempio `@^2.0.0`) di un modulo già installato —
reinstallare con una versione diversa è il modo per aggiornare un modulo. Un torneo già avviato
continua a fare riferimento alla versione con cui è stato creato; aggiornare un modulo non cambia
mai retroattivamente un torneo già in corso.

Vedi il [riferimento comandi](/it/help/cli/commands/) per il resto delle opzioni di `module`.
