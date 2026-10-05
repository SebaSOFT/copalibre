---
title: 'Per iniziare: self-hosting'
description: Esegui CopaLibre dal sorgente su Windows, macOS o Linux, poi scegli tra una topologia di distribuzione con reverse proxy o Kubernetes.
capabilities:
  - platform/self-hosted-deployment
roles:
  - super-admin
---

Questa pagina avvia un checkout appena scaricato sulla tua macchina o server, poi spiega i due modi
supportati per metterlo davanti a traffico reale. Per il riferimento dei comandi CLI vedi
[Installazione](/help/cli/installation/); per i dettagli su backup/ripristino e dati persistenti vedi
`docs/self-hosting.md` nel repository.

## 1. Prerequisiti, per piattaforma

Servono Docker, Docker Compose v2 e Git. Il wrapper del sorgente richiede anche Node.js 24 e Corepack sull’host. Il binario autonomo non richiede Node.js; vedi [Installazione](/it/help/cli/installation/).

**Linux** — installa Docker Engine e il plugin Compose dal gestore pacchetti della tua distribuzione
o dal [repository ufficiale di Docker](https://docs.docker.com/engine/install/) (`docker-ce`,
`docker-compose-plugin`). Aggiungi il tuo utente al gruppo `docker` così `./copalibre` non ha bisogno
di `sudo`.

**macOS** — installa [Docker Desktop](https://docs.docker.com/desktop/install/mac-install/) (Apple
Silicon o Intel). Funziona anche Colima con le CLI standalone `docker`/`docker-compose`, se preferisci
non eseguire Docker Desktop.

**Windows** — installa [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/) con
il **backend WSL2** abilitato, ed esegui ogni comando qui sotto da una distro WSL2 (Ubuntu è quella
meglio testata), non da PowerShell o `cmd.exe` direttamente. `./copalibre` è uno script `sh` POSIX;
WSL2 gli dà una vera shell e permette all'integrazione WSL di Docker Desktop di esporgli il daemon
senza configurazione di rete aggiuntiva. Git Bash può eseguire `sh copalibre <command>` all'occorrenza,
ma i percorsi di mount dei volumi e i permessi dei file sono più prevedibili sotto WSL2 — preferiscilo
per qualsiasi cosa oltre a un rapido test locale.

## 2. Eseguilo dal sorgente

Compila entrambe le immagini dalla radice del repository, poi inizializza una directory vuota:

```bash
git clone https://github.com/SebaSOFT/copalibre.git
cd copalibre
docker build --target runtime -t copalibre:local .
docker build --target web -t copalibre-web:local .
mkdir my-league && cd my-league
../copalibre init
```

Prima dell’avvio modifica `.env`: usa `COPALIBRE_IMAGE=copalibre:local` e `COPALIBRE_WEB_IMAGE=copalibre-web:local` per queste immagini. Altrimenti `init` seleziona le immagini pubblicate della versione CLI. Sostituisci password di sviluppo e token di bootstrap; configura identità, email e URL pubblici. Imposta `GARAGE_RPC_SECRET` con `openssl rand -hex 32`; Compose interpola questo valore obbligatorio anche con lo storage opzionale disattivato.

```bash
../copalibre doctor
../copalibre start
../copalibre status
../copalibre restart
../copalibre stop
../copalibre create-admin --organization-alias my-league --organization-name "My League" --email admin@example.com
```

Usa copalibre status per controllare container e gateway. copalibre restart verifica PostgreSQL e doctor prima di avviare di nuovo i servizi. copalibre stop mantiene i volumi; --down rimuove container e reti. In modalità Kubernetes, start/stop/restart mostrano istruzioni Helm o kubectl.

Il gateway espone HTTP su `http://localhost:8080` (`COPALIBRE_PORT`). Compose espone anche le porte dei servizi; limitane l’accesso sull’host e sulla rete. TLS termina al proxy perimetrale.

## 3. Scegli come esporlo

### Opzione A — host singolo, reverse proxy al confine

Instrada il dominio applicativo verso `gateway:80` nella rete Compose, oppure `127.0.0.1:8080` per un proxy sull’host. Il gateway gestisce API, autenticazione, SSE e web sulla stessa origine; il contenitore web inoltra le pagine dinamiche a `web-ssr`. Usa `deploy/proxy/Caddyfile` o `deploy/proxy/nginx.conf`, configura TLS e URL pubblici e disattiva il buffering SSE. I domini API/events separati sono facoltativi con un’origine unica.

```bash
../copalibre doctor --check-proxy --proxy-url https://app.example/events/proxy-check
```

### Opzione B — Kubernetes (da K3s a cluster enterprise)

Per distribuzioni multi-nodo, scalate orizzontalmente, o su infrastruttura gestita, un chart Helm
(`deploy/helm/copalibre/`) distribuisce le stesse immagini, contratto d'ambiente, controlli di
salute e processo di migrazione dell'installazione Compose — installarlo con i valori predefiniti si
comporta in modo identico al solo chart base.

Esegui Helm dalla radice del repository dopo aver configurato `my-values.yaml` con database, identità, email e URL pubblici. Usa una versione già pubblicata per entrambe le immagini; 1.2.5 sarà disponibile dopo la pubblicazione.

```bash
cd ..
helm show values deploy/helm/copalibre/ > my-values.yaml
```

```bash
helm install my-copalibre deploy/helm/copalibre/ -f my-values.yaml \
  --set image.repository=ghcr.io/sebasoft/copalibre --set-string image.tag=1.2.5 \
  --set web.image.repository=ghcr.io/sebasoft/copalibre-web --set-string web.image.tag=1.2.5
```

Aggiungi questi gruppi `values.yaml` additivi, disattivati per impostazione predefinita, secondo le
necessità — nessuno richiede un fork del template:

- **`autoscaling`** — HPA per ruolo (`api` sul tasso di richieste HTTP, `events` sulle connessioni SSE
  attive, `worker` sulla profondità/età della coda outbox) — richiede un adattatore di metriche
  personalizzate (Prometheus Adapter, KEDA); nessuno di questi tre segnali è una metrica Kubernetes
  nativa.
- **`podDisruptionBudget`** e **`affinity.antiAffinity`** — protezione dalle interruzioni e
  distribuzione flessibile tra i nodi, indipendente dall'autoscaling.
- **`networkPolicy`** — negazione predefinita per ruolo, con `publicRoles` (predefinito `api`,
  `events`, più `web` sempre) aperto al traffico esterno.
- **`ingress`** — richiede un ingress controller e, per il TLS automatico, cert-manager.
- **`externalSecrets`** — richiede l'External Secrets Operator; ottiene `DATABASE_URL`, le credenziali
  `COPALIBRE_OBJECT_STORAGE_*`, ecc. dal tuo vero secret store invece che da un semplice manifesto
  `Secret`.

PostgreSQL gestito, storage a oggetti compatibile S3 (AWS S3, Garage, R2, B2), o un percorso VM gestita
(Kamal, `docs/deployment/kamal.md`) sono tutte configurazioni, non modifiche al codice —
`packages/persistence` li supporta già genericamente. Valida qualsiasi modifica al chart localmente su
un cluster multi-nodo usa e getta prima di toccarne uno reale:

```bash
k3d cluster create --config deploy/helm/k3s-dev-cluster.yaml
```

Elenco completo dei prerequisiti e le evidenze misurate di failover multi-nodo, backup-ripristino e
sicurezza degli upgrade su cui si basa questa affermazione: `docs/deployment/enterprise-kubernetes.md`
nel repository.

## 4. Prossimi passi

- [Il tuo primo torneo](/help/getting-started/) — crea e pubblica una competizione una volta attiva
  l'installazione.
- [Operatività e tracciabilità](/help/operations/) — gestire le partite e correggere i risultati in
  sicurezza.
- [Riferimento CLI](/help/cli/commands/) — ogni sottocomando `copalibre`, inclusi `backup`, `restore`
  e `upgrade-check`.
