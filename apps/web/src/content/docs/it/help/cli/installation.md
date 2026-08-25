---
title: Installazione
description: Come installare CopaLibre da zero con il CLI copalibre.
---

## Requisiti

Docker e Docker Compose sull'host. `copalibre` è un binario autonomo — non è richiesta
l'installazione di Node.js. Non è nemmeno necessario installare PostgreSQL né i suoi strumenti
client — vengono eseguiti dentro i container che `copalibre` gestisce.

`install.sh` supporta Linux (x86_64/arm64), macOS (x86_64/arm64, incluso Apple Silicon sotto
Rosetta), e Windows (x86_64).

## Passaggi

```bash
curl -fsSL https://www.copalibre.app/install.sh | bash
mkdir mia-lega && cd mia-lega
copalibre init      # scrive i valori predefiniti non segreti in .env
```

Modifica `.env`: la password di PostgreSQL, `COPALIBRE_BOOTSTRAP_TOKEN`, JWKS/issuer/audience OIDC,
l'ID client del browser, e un provider email.

```bash
copalibre doctor    # valida la configurazione prima di avviare qualsiasi cosa
copalibre start     # avvia PostgreSQL, esegue doctor, e avvia tutti i processi
copalibre create-admin --organization-alias mia-lega --organization-name "Mia Lega" --email admin@esempio.com
```

`docker-compose.yml` deliberatamente non termina TLS — un proxy inverso (Caddy o NGINX) si posiziona
al margine. Configurazioni di esempio si trovano in `deploy/proxy/`; verifica l'installazione con
`copalibre doctor --check-proxy --proxy-url https://eventi.esempio/events/proxy-check`.

Dettagli completi su dati persistenti, backup/ripristino e il proxy inverso: `docs/self-hosting.md`
nel repository. Aggiornare il binario `copalibre` stesso: [Aggiornamento](/it/help/cli/updating/).
