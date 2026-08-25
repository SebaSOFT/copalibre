---
title: 'Per iniziare: self-hosting'
description: Esegui CopaLibre dal sorgente su Windows, macOS o Linux, poi scegli tra una topologia di distribuzione con reverse proxy o Kubernetes.
---

Questa pagina avvia un checkout appena scaricato sulla tua macchina o server, poi spiega i due modi
supportati per metterlo davanti a traffico reale. Per il riferimento dei comandi CLI vedi
[Installazione](/help/cli/installation/); per i dettagli su backup/ripristino e dati persistenti vedi
`docs/self-hosting.md` nel repository.

## 1. Prerequisiti, per piattaforma

Ogni ruolo viene distribuito come un'unica immagine Docker multi-ruolo costruita direttamente da
questo repository — non c'è uno step separato di "build di produzione". Ti servono Docker, Docker
Compose v2 e Git; nient'altro gira sull'host.

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

```bash
git clone https://github.com/SebaSOFT/copalibre.git
cd copalibre
./copalibre init      # scrive i valori predefiniti non segreti in .env, elenca i segreti richiesti
```

Modifica `.env`: una password PostgreSQL robusta, un `COPALIBRE_BOOTSTRAP_TOKEN` opaco, i tuoi valori
OIDC JWKS/issuer/audience (oppure il provider di identità nativo email/password — vedi
[Ruoli e permessi](/help/control/roles-permissions/)), l'ID client browser pubblico, e un provider
email supportato.

```bash
./copalibre doctor    # valida la configurazione prima che qualcosa si avvii
./copalibre start     # docker compose up --detach --wait — costruisce le immagini localmente
./copalibre create-admin --organization-alias my-league --organization-name "My League" \
  --email admin@example.com
```

`./copalibre start` costruisce `copalibre:local` e `copalibre-web:local` da questo checkout per
impostazione predefinita — quella build **è** "eseguire dal sorgente". Punta invece
`COPALIBRE_IMAGE`/`COPALIBRE_WEB_IMAGE` verso un tag pubblicato se preferisci scaricare una release
piuttosto che costruirne una.

A questo punto lo stack è in esecuzione ma non raggiungibile dall'esterno dell'host: `docker-compose.yml`
non termina mai TLS né espone deliberatamente una porta pubblica da solo. Scegli una delle due
topologie qui sotto per metterlo davvero davanti agli utenti.

## 3. Scegli come esporlo

### Opzione A — host singolo, reverse proxy al confine

La topologia supportata più semplice: un unico host Docker che esegue Compose, con Caddy o NGINX
davanti che termina il TLS e instrada verso i servizi interni. È per questo che `./copalibre start` è
pensato di default, su tutte e tre le piattaforme sopra.

1. Imposta `COPALIBRE_APP_HOST`, `COPALIBRE_API_HOST` e `COPALIBRE_EVENTS_HOST` con i tuoi hostname
   pubblici, e `ACME_EMAIL` così il proxy può richiedere automaticamente i certificati.
2. Instrada il traffico API ordinario verso `api:3001`, il traffico SSE verso `events:3002`, le route
   SSR pubbliche verso `web-ssr:3005`, e il traffico web statico control/public verso `web:4321`.
   Configurazioni di esempio:
   [`deploy/proxy/Caddyfile`](https://github.com/SebaSOFT/copalibre/blob/main/deploy/proxy/Caddyfile)
   e [`deploy/proxy/nginx.conf`](https://github.com/SebaSOFT/copalibre/blob/main/deploy/proxy/nginx.conf).
   Il proxy deve preservare gli header di forwarding, mantenere l'SSE non bufferizzato, e lasciare che
   gli stream inattivi sopravvivano agli heartbeat — l'esempio Caddy imposta `flush_interval -1`
   esattamente per questo motivo.
3. Verificalo: `./copalibre doctor --check-proxy --proxy-url https://events.example/events/proxy-check`.

Funziona in modo identico su Linux, macOS e Windows (WSL2) — il proxy è solo un altro container (o un
processo sullo stesso host) davanti allo stesso stack Compose.

### Opzione B — Kubernetes (da K3s a cluster enterprise)

Per distribuzioni multi-nodo, scalate orizzontalmente, o su infrastruttura gestita, un chart Helm
(`deploy/helm/copalibre/`) distribuisce le stesse immagini, contratto d'ambiente, controlli di
salute e processo di migrazione dell'installazione Compose — installarlo con i valori predefiniti si
comporta in modo identico al solo chart base.

```bash
helm install my-copalibre deploy/helm/copalibre/ \
  --set image.tag=<version> --set web.image.tag=<version>
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

PostgreSQL gestito, storage a oggetti compatibile S3 (AWS S3, MinIO, R2, B2), o un percorso VM gestita
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
