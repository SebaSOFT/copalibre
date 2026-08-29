---
title: 'Primeiros passos: auto-hospedagem'
description: Execute o CopaLibre a partir do código-fonte no Windows, macOS ou Linux, depois escolha uma topologia de implantação com proxy reverso ou Kubernetes.
capabilities:
  - platform/self-hosted-deployment
roles:
  - super-admin
---

Esta página coloca um checkout novo rodando na sua própria máquina ou servidor, e depois explica as
duas formas suportadas de colocá-lo diante de tráfego real. Para referência de comandos da CLI, veja
[Instalação](/help/cli/installation/); para detalhes de backup/restauração e dados persistentes, veja
`docs/self-hosting.md` no repositório.

## 1. Pré-requisitos, por plataforma

Cada função é distribuída como uma única imagem Docker multifunção construída diretamente a partir
deste repositório — não há uma etapa separada de "build de produção". Você precisa de Docker, Docker
Compose v2 e Git; nada mais roda no host.

**Linux** — instale o Docker Engine e o plugin Compose a partir do gerenciador de pacotes da sua
distribuição ou do [repositório oficial do Docker](https://docs.docker.com/engine/install/)
(`docker-ce`, `docker-compose-plugin`). Adicione seu usuário ao grupo `docker` para que `./copalibre`
não precise de `sudo`.

**macOS** — instale o [Docker Desktop](https://docs.docker.com/desktop/install/mac-install/) (Apple
Silicon ou Intel). Colima com as CLIs autônomas `docker`/`docker-compose` também funciona, se você
preferir não rodar o Docker Desktop.

**Windows** — instale o [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/)
com o **backend WSL2** habilitado, e execute cada comando abaixo de dentro de uma distro WSL2 (Ubuntu
é a mais testada), não do PowerShell ou `cmd.exe` diretamente. `./copalibre` é um script `sh` POSIX;
o WSL2 dá a ele um shell de verdade e permite que a integração WSL do Docker Desktop exponha o
daemon a ele sem configuração de rede extra. O Git Bash pode rodar `sh copalibre <command>` em um
aperto, mas os caminhos de montagem de volume e as permissões de arquivo são mais previsíveis no
WSL2 — prefira-o para qualquer coisa além de um teste local rápido.

## 2. Execute a partir do código-fonte

```bash
git clone https://github.com/SebaSOFT/copalibre.git
cd copalibre
./copalibre init      # grava padrões não secretos em .env, lista os segredos necessários
```

Edite `.env`: uma senha PostgreSQL forte, um `COPALIBRE_BOOTSTRAP_TOKEN` opaco, seus valores OIDC de
JWKS/issuer/audience (ou o provedor de identidade nativo por e-mail/senha — veja
[Papéis e permissões](/help/control/roles-permissions/)), o ID do cliente do navegador público, e um
provedor de e-mail suportado.

```bash
./copalibre doctor    # valida a configuração antes de qualquer coisa iniciar
./copalibre start     # docker compose up --detach --wait — constrói as imagens localmente
./copalibre create-admin --organization-alias my-league --organization-name "My League" \
  --email admin@example.com
```

`./copalibre start` constrói `copalibre:local` e `copalibre-web:local` a partir deste checkout por
padrão — essa build **é** "rodar a partir do código-fonte". Aponte
`COPALIBRE_IMAGE`/`COPALIBRE_WEB_IMAGE` para uma tag publicada em vez disso, se preferir baixar uma
release em vez de construir uma.

Neste ponto, a pilha está rodando mas não é acessível de fora do host: `docker-compose.yml`
deliberadamente nunca termina TLS nem expõe uma porta pública por conta própria. Escolha uma das duas
topologias abaixo para realmente colocá-la diante dos usuários.

## 3. Escolha como expô-la

### Opção A — host único, proxy reverso na borda

A topologia suportada mais simples: um único host Docker rodando Compose, com Caddy ou NGINX na
frente terminando TLS e roteando para os serviços internos. É para isso que `./copalibre start` é
construído por padrão, em qualquer uma das três plataformas acima.

1. Defina `COPALIBRE_APP_HOST`, `COPALIBRE_API_HOST` e `COPALIBRE_EVENTS_HOST` com seus nomes de
   host públicos, e `ACME_EMAIL` para que o proxy possa solicitar certificados automaticamente.
2. Roteie o tráfego comum da API para `api:3001`, o tráfego SSE para `events:3002`, as rotas SSR
   públicas para `web-ssr:3005`, e o tráfego web estático control/public para `web:4321`.
   Exemplos de configuração:
   [`deploy/proxy/Caddyfile`](https://github.com/SebaSOFT/copalibre/blob/main/deploy/proxy/Caddyfile)
   e [`deploy/proxy/nginx.conf`](https://github.com/SebaSOFT/copalibre/blob/main/deploy/proxy/nginx.conf).
   O proxy deve preservar os cabeçalhos de encaminhamento, manter o SSE sem buffer, e deixar os
   streams ociosos sobreviverem aos heartbeats — o exemplo do Caddy define `flush_interval -1`
   exatamente por esse motivo.
3. Verifique: `./copalibre doctor --check-proxy --proxy-url https://events.example/events/proxy-check`.

Isso funciona identicamente em Linux, macOS e Windows (WSL2) — o proxy é apenas mais um contêiner (ou
um processo no mesmo host) diante da mesma pilha Compose.

### Opção B — Kubernetes (de K3s a clusters empresariais)

Para implantações multi-nó, escaláveis horizontalmente, ou em infraestrutura gerenciada, um chart
Helm (`deploy/helm/copalibre/`) implanta as mesmas imagens, contrato de ambiente, verificações de
saúde e processo de migração que a instalação Compose — instalá-lo com valores padrão se comporta de
forma idêntica ao chart base sozinho.

```bash
helm install my-copalibre deploy/helm/copalibre/ \
  --set image.tag=<version> --set web.image.tag=<version>
```

Adicione estes grupos aditivos de `values.yaml`, desativados por padrão, conforme necessário —
nenhum exige um fork do template:

- **`autoscaling`** — HPA por função (`api` na taxa de requisições HTTP, `events` nas conexões SSE
  ativas, `worker` na profundidade/idade da fila outbox) — precisa de um adaptador de métricas
  personalizado (Prometheus Adapter, KEDA); nenhum desses três sinais é uma métrica nativa do
  Kubernetes.
- **`podDisruptionBudget`** e **`affinity.antiAffinity`** — proteção contra interrupções e
  distribuição flexível entre nós, independente do autoscaling.
- **`networkPolicy`** — negação por padrão por função, com `publicRoles` (padrão `api`, `events`,
  mais `web` sempre) aberto ao tráfego externo.
- **`ingress`** — precisa de um controlador de ingress e, para TLS automático, do cert-manager.
- **`externalSecrets`** — precisa do External Secrets Operator; obtém `DATABASE_URL`, credenciais
  `COPALIBRE_OBJECT_STORAGE_*`, etc. do seu cofre de segredos real em vez de um manifesto `Secret`
  simples.

PostgreSQL gerenciado, armazenamento de objetos compatível com S3 (AWS S3, MinIO, R2, B2), ou um
caminho de VM gerenciada (Kamal, `docs/deployment/kamal.md`) são todos configuração, não mudanças de
código — `packages/persistence` já os atende de forma genérica. Valide qualquer alteração de chart
localmente em um cluster multi-nó descartável antes de tocar em um real:

```bash
k3d cluster create --config deploy/helm/k3s-dev-cluster.yaml
```

Lista completa de pré-requisitos e as evidências medidas de failover multi-nó, backup-restauração e
segurança de upgrade nas quais essa afirmação se baseia: `docs/deployment/enterprise-kubernetes.md`
no repositório.

## 4. Próximos passos

- [Seu primeiro torneio](/help/getting-started/) — crie e publique uma competição assim que a
  instalação estiver no ar.
- [Operação e rastreabilidade](/help/operations/) — conduzir partidas e corrigir resultados com
  segurança.
- [Referência da CLI](/help/cli/commands/) — cada subcomando `copalibre`, incluindo `backup`,
  `restore` e `upgrade-check`.
