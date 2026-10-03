---
title: Instalação
description: Como instalar o CopaLibre do zero com o CLI copalibre.
capabilities: []
roles:
  - super-admin
---

## Requisitos

Docker e Docker Compose no host. `copalibre` é um binário independente — não é necessário instalar
Node.js. Também não é necessário instalar o PostgreSQL nem suas ferramentas cliente — eles rodam
dentro dos contêineres que o `copalibre` gerencia.

O `install.sh` oferece suporte a Linux (x86_64/arm64), macOS (x86_64/arm64, incluindo Apple Silicon
sob Rosetta), e Windows (x86_64).

## Passos

Execute os comandos em Bash (WSL2 ou Git Bash no Windows). O export PATH ativa o diretório do binário no shell atual. Para selecionar uma versão publicada, encaminhe o script para `VERSION=1.2.5 bash`; essa versão deve estar publicada.

```bash
curl -fsSL https://github.com/SebaSOFT/copalibre/releases/latest/download/install.sh | bash
export PATH="$HOME/.copalibre/bin:$PATH"
mkdir minha-liga && cd minha-liga
copalibre init      # grava valores padrão não secretos em .env
```

Edite o `.env`: a senha do PostgreSQL, `COPALIBRE_BOOTSTRAP_TOKEN`, JWKS/issuer/audience do OIDC, o
ID do cliente do navegador, e um provedor de email.

Antes de iniciar, defina `GARAGE_RPC_SECRET` em `.env` com um valor gerado por `openssl rand -hex 32`; Compose exige isso mesmo sem armazenamento opcional.

```bash
copalibre doctor    # valida a configuração antes de iniciar qualquer coisa
copalibre start     # sobe o PostgreSQL, executa doctor, e inicia todos os processos
copalibre create-admin --organization-alias minha-liga --organization-name "Minha Liga" --email admin@exemplo.com
```

O `docker-compose.yml` deliberadamente não termina TLS — um proxy reverso (Caddy ou NGINX) fica na
borda. Configurações de exemplo estão em `deploy/proxy/`; verifique a instalação com
`copalibre doctor --check-proxy --proxy-url https://eventos.exemplo/events/proxy-check`.

Detalhes completos sobre dados persistentes, backup/restauração e o proxy reverso: `docs/self-hosting.md`
no repositório. Atualizar o próprio binário `copalibre`: [Atualização](/pt/help/cli/updating/).
