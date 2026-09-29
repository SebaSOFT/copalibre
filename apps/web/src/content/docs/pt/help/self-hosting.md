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

São necessários Docker, Docker Compose v2 e Git. O wrapper do código-fonte também exige Node.js 24 e Corepack no host. O binário independente não exige Node.js; veja [Instalação](/pt/help/cli/installation/).

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

Compile as duas imagens na raiz do repositório e inicialize um diretório vazio:

```bash
git clone https://github.com/SebaSOFT/copalibre.git
cd copalibre
docker build --target runtime -t copalibre:local .
docker build --target web -t copalibre-web:local .
mkdir my-league && cd my-league
../copalibre init
```

Antes de iniciar, edite `.env`: use `COPALIBRE_IMAGE=copalibre:local` e `COPALIBRE_WEB_IMAGE=copalibre-web:local` para essas imagens. Caso contrário, `init` seleciona imagens publicadas da versão do CLI. Substitua senhas de desenvolvimento e token de bootstrap; configure identidade, email e URLs públicas. Defina `GARAGE_RPC_SECRET` com `openssl rand -hex 32`; Compose interpola esse valor obrigatório mesmo com armazenamento opcional desativado.

```bash
../copalibre doctor
../copalibre start
../copalibre create-admin --organization-alias my-league --organization-name "My League" --email admin@example.com
```

O gateway publica HTTP em `http://localhost:8080` (`COPALIBRE_PORT`). Compose também publica portas dos serviços; restrinja sua exposição no host e na rede. TLS termina no proxy de borda.

## 3. Escolha como expô-la

### Opção A — host único, proxy reverso na borda

Encaminhe o domínio da aplicação para `gateway:80` na rede Compose, ou `127.0.0.1:8080` se o proxy estiver no host. O gateway distribui API, autenticação, SSE e web na mesma origem; o contêiner web encaminha páginas dinâmicas para `web-ssr`. Use `deploy/proxy/Caddyfile` ou `deploy/proxy/nginx.conf`, configure TLS e URLs públicas e mantenha SSE sem buffer. Os domínios API/events separados são opcionais com uma única origem.

```bash
../copalibre doctor --check-proxy --proxy-url https://app.example/events/proxy-check
```

### Opção B — Kubernetes (de K3s a clusters empresariais)

Para implantações multi-nó, escaláveis horizontalmente, ou em infraestrutura gerenciada, um chart
Helm (`deploy/helm/copalibre/`) implanta as mesmas imagens, contrato de ambiente, verificações de
saúde e processo de migração que a instalação Compose — instalá-lo com valores padrão se comporta de
forma idêntica ao chart base sozinho.

Execute Helm na raiz do repositório após configurar `my-values.yaml` com banco, identidade, email e URLs públicas. Use uma versão já publicada para ambas as imagens; 1.2.0 ficará disponível após a publicação.

```bash
cd ..
helm show values deploy/helm/copalibre/ > my-values.yaml
```

```bash
helm install my-copalibre deploy/helm/copalibre/ -f my-values.yaml \
  --set image.repository=ghcr.io/sebasoft/copalibre --set-string image.tag=1.2.0 \
  --set web.image.repository=ghcr.io/sebasoft/copalibre-web --set-string web.image.tag=1.2.0
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

PostgreSQL gerenciado, armazenamento de objetos compatível com S3 (AWS S3, Garage, R2, B2), ou um
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
