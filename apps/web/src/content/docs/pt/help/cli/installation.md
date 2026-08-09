---
title: Instalação
description: Como instalar o CopaLibre do zero com o CLI copalibre.
---

## Requisitos

Docker e Docker Compose no host. Não é necessário instalar o PostgreSQL nem suas ferramentas
cliente — eles rodam dentro dos contêineres que o `copalibre` gerencia.

## Passos

```bash
git clone https://github.com/SebaSOFT/copalibre.git
cd copalibre
./copalibre init      # grava valores padrão não secretos em .env
```

Edite o `.env`: a senha do PostgreSQL, `COPALIBRE_BOOTSTRAP_TOKEN`, JWKS/issuer/audience do OIDC, o
ID do cliente do navegador, e um provedor de email.

```bash
./copalibre doctor    # valida a configuração antes de iniciar qualquer coisa
./copalibre start     # sobe o PostgreSQL, executa doctor, e inicia todos os processos
./copalibre create-admin --organization-alias minha-liga --organization-name "Minha Liga" --email admin@exemplo.com
```

O `docker-compose.yml` deliberadamente não termina TLS — um proxy reverso (Caddy ou NGINX) fica na
borda. Configurações de exemplo estão em `deploy/proxy/`; verifique a instalação com `./copalibre
doctor --check-proxy --proxy-url https://eventos.exemplo/events/proxy-check`.

Detalhes completos sobre dados persistentes, backup/restauração e o proxy reverso: `docs/self-hosting.md`
no repositório.
