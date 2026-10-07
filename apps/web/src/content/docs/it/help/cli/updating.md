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
