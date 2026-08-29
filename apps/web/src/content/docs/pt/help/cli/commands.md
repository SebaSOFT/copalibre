---
title: Referência de comandos
description: Cada comando do CLI copalibre, seu uso e suas flags.
capabilities: []
roles:
  - super-admin
  - admin
---

Cada comando responde a `--help`/`-h` com exatamente este texto de uso, gerado a partir de uma única
fonte dentro do próprio CLI — esta página não pode descrever um comando de forma diferente do que o
CLI realmente faz. `copalibre --version` imprime apenas a versão instalada, para scripts.

## init

`copalibre init [--module-dev]` ou `copalibre init --kubernetes [--namespace <ns>] [--release
<nome>] [--context <ctx>]`

Grava uma instalação completa no diretório atual. Não requer um checkout do código-fonte: execute-o
em qualquer diretório vazio, e cada comando posterior detecta automaticamente esse diretório a partir
do marcador (`.copalibre/installation.json`) que ele grava, da mesma forma que `.git` marca um
checkout de repositório. Recusa-se a executar novamente em um diretório que já contém uma instalação.
Um diretório fica fixado à versão do CopaLibre com a qual o `init` o criou — executar várias versões
lado a lado significa executar a versão de CLI correspondente por diretório (veja
[atualização](/pt/help/cli/updating/)).

Sem `--kubernetes`, grava `docker-compose.yml` e `.env` com valores padrão não secretos, e lista os
segredos necessários para preencher em `.env` depois.

- `--module-dev`: também grava `docker-compose.module-dev.yml` e um diretório `modules-dev/`,
  montado em `api`/`worker` com `COPALIBRE_MODULE_SOURCE_ALLOWLIST` pré-configurado — combina-se com
  `module scaffold --output modules-dev/<alias>` e `module add <alias> --source
file:///var/lib/copalibre/modules-dev/<alias>` para desenvolver um módulo contra uma instância
  auto-hospedada em execução, sem checkout do código-fonte.

Com `--kubernetes`, grava um scaffold `values.yaml` do Helm em vez disso — sem arquivo compose, sem
`.env`; o próprio mecanismo de Secret/ConfigMap do Kubernetes permanece autoritativo para a
configuração. Fluxo completo, incluindo o bootstrap do primeiro administrador como um Job do Helm de
uso único: `docs/deployment/enterprise-kubernetes.md` no repositório.

- `--kubernetes`: faz o scaffold de uma instalação Helm em vez de uma Compose
- `--namespace <ns>`: namespace do Kubernetes a registrar (padrão: `default`)
- `--release <nome>`: nome do release do Helm a registrar (padrão: `copalibre`)
- `--context <ctx>`: kube-context a registrar (padrão: nenhum — forneça explicitamente a cada vez)

## doctor

`copalibre doctor [--check-proxy] [--proxy-url <url>]`

Valida configuração e dependências antes de iniciar.

- `--check-proxy`: também verifica a configuração do proxy reverso
- `--proxy-url <url>`: URL pública a testar quando `--check-proxy` é usado

## dev

`copalibre dev [--hybrid]`

Executa um ambiente de desenvolvimento, containerizado ou híbrido.

- `--hybrid`: infraestrutura no Docker, processos de aplicação no host

## start

`copalibre start`

Sobe o PostgreSQL, executa doctor, e inicia todos os papéis de processo.

## migrate

`copalibre migrate`

Executa as migrações de banco de dados pendentes.

## backup

`copalibre backup [--file <caminho>] [--retain <n>] [--dry-run]`

Cria um **pacote de backup** comprimido (`.tar.gz`) sob `backups/`, com o dump do PostgreSQL e um
manifesto (data e versão do CopaLibre). Aplica retenção: após um backup bem-sucedido, exclui pacotes
mais antigos além de `--retain`. Só exclui arquivos que correspondem ao padrão de nome de pacote
(`copalibre-<data>.tar.gz`) — nunca toca em nenhum outro arquivo sob `backups/`.

- `--file <caminho>`: destino do pacote, dentro de `backups/` (padrão: um nome com timestamp)
- `--retain <n>`: pacotes a manter após este backup (padrão: 5)
- `--dry-run`: imprime o plano de backup sem executá-lo

Os dados dos módulos instalados (descritores de disciplina, perfis de torneio) residem no
PostgreSQL, então estão incluídos no dump. Os bytes de objetos no armazenamento de objetos
(`object-storage-data`) estão fora do escopo deste comando — faça backup deles separadamente no
nível de infraestrutura, como o guia de autohospedagem já indica.

## restore

`copalibre restore --file <caminho> (--confirm | --dry-run) [--allow-newer-backup]`

Extrai um pacote de backup, restaura seu dump do PostgreSQL, executa as migrações pendentes e
confirma que o esquema aplicado corresponde a esta instalação — tudo em uma única invocação.

- `--file <caminho>`: pacote a restaurar, dentro de `backups/`
- `--confirm`: necessário para realmente executar a restauração
- `--dry-run`: imprime o plano de restauração sem executá-lo
- `--allow-newer-backup`: permite restaurar um pacote produzido por uma versão do CopaLibre mais
  nova que a que está em execução (recusado por padrão)

Após um `pg_restore` bem-sucedido, `restore` executa automaticamente `copalibre migrate` e então
abre uma conexão para verificar que a versão do esquema aplicado corresponde exatamente ao que esta
instalação espera (a mesma verificação que `GET /ready` usa) — assim uma restauração nunca deixa o
código e o banco de dados silenciosamente dessincronizados. Se a migração falhar, `restore` relata
isso com seu código de saída sem afirmar sucesso; tente novamente com `copalibre migrate` e depois
`copalibre doctor`.

Um pacote cujo manifesto registra uma versão do CopaLibre mais nova que a que está em execução é
recusado antes de tocar no banco de dados, nomeando ambas as versões — atualize esta instalação
primeiro, ou passe `--allow-newer-backup` se realmente pretende prosseguir.

## upgrade-check

`copalibre upgrade-check --target-version <semver>`

Verifica a compatibilidade dos módulos instalados e as migrações pendentes antes de atualizar.

- `--target-version <semver>`: versão do CopaLibre contra a qual verificar módulos e migrações

Termina com código de saída diferente de zero se algum módulo instalado deixaria de ser compatível
com a versão alvo. Veja [atualização](/pt/help/cli/updating/) para a sequência completa.

## create-admin

`copalibre create-admin --organization-alias <alias> --organization-name <nome> --email <email>`

Cria a primeira conta de administrador de uma organização.

## login

`copalibre login [--api-url <url>] [--token <token>]`

Armazena um token de acesso pessoal para que `statistics-rebuild` e `module add/list/remove/verify`
possam rodar contra uma instalação remota por meio de uma conexão HTTP autenticada — o caminho para
administrar uma instalação já em execução, incluindo instalar ou atualizar o CLI depois que o Docker
já está rodando, a partir de uma máquina que nunca precisa de credenciais de banco de dados. Gere o
token na tela de preferências do painel de controle enquanto já estiver logado, e cole-o aqui. Valida
o token com uma chamada autenticada antes de armazená-lo; recusa e não armazena nada se o token for
inválido.

- `--api-url <url>`: instalação alvo (padrão: `COPALIBRE_API_URL`, que `copalibre init` já grava em
  `.env`)
- `--token <token>`: o próprio token (padrão: lido do stdin via pipe, ou um prompt interativo que
  mascara cada tecla)

Armazena a credencial em `.copalibre/credentials.json` (`0600`) do diretório atual — execute `login`
de dentro do diretório de instalação que `copalibre init` criou. Reexecutar `login` no mesmo
diretório substitui o token armazenado, diferente do marcador do `init`.

## statistics-rebuild

`copalibre statistics-rebuild --organization <alias> [--tournament <alias>]`

Recalcula cada total estatístico dobrado (`statistic_totals`) a partir dos fatos de origem — eventos
registrados de partidas finalizadas, elencos e ajustes manuais — para toda a organização por padrão,
ou restrito a um torneio.

- `--organization <alias>`: organização para a qual recalcular as estatísticas
- `--tournament <alias>`: restringe o recálculo a um torneio dentro da organização

Idempotente: usa o mesmo `refold` e o mesmo caminho de escrita de excluir-e-inserir que o disparo
orientado a eventos, então executá-lo duas vezes seguidas produz linhas de `statistic_totals`
idênticas byte a byte (exceto `updated_at`/a versão interna de projeção). Útil para completar o
histórico registrado antes da existência do motor de dobra, ou para verificar os totais contra os
fatos a qualquer momento. Requer autoridade de administrador da organização depois de logado via
[`login`](#login).

## module

`copalibre module <add|list|remove|verify>`

Gerencia os módulos de disciplina e perfil de torneio instalados. `add`/`list`/`remove`/`verify`
exigem autoridade de super-admin da instalação depois de logado via [`login`](#login).

### module add

`copalibre module add <alias>[@intervalo] [--source <url>] [--allow-unsatisfied-capabilities]`

Instala um módulo por alias, opcionalmente fixado a um intervalo de versão.

- `--source <url>`: uma fonte alternativa explicitamente habilitada, em vez da fonte selecionada
- `--allow-unsatisfied-capabilities`: instala mesmo que as capacidades exigidas declaradas ainda não
  estejam satisfeitas

### module list

`copalibre module list [--outdated]`

Lista os módulos instalados, ou apenas os que têm uma versão publicada mais nova.

- `--outdated`: mostra apenas os módulos com uma versão publicada mais nova

### module remove

`copalibre module remove <alias>`

Remove um módulo instalado que nenhum torneio iniciado referencia.

### module verify

`copalibre module verify`

Revalida cada módulo instalado contra a versão do core em execução.

### module scaffold

`copalibre module scaffold <discipline|tournament-profile> <alias> [--author <nome>] [--licence <licenca>] [--name <nome>] [--source-url <url>] [--output <dir>]`

Gera um pacote de módulo estruturalmente válido para começar a autoria — semeado a partir de um dos
documentos já válidos do catálogo do CopaLibre, não um chute cego do schema — como um repositório
Git local etiquetado, pronto para editar, validar e instalar/enviar.

- `--author <nome>`: autor da atribuição (padrão: Unknown)
- `--licence <licenca>`: identificador SPDX (padrão: AGPL-3.0-only)
- `--name <nome>`: nome de implantação (padrão: o alias)
- `--source-url <url>`: URL de origem da atribuição
- `--output <dir>`: onde gravar o repositório do módulo (padrão: `modules/<alias>`)

### module validate-local

`copalibre module validate-local <caminho>`

Valida um pacote de módulo local sem buscá-lo nem instalá-lo — a mesma verificação que `module
add`/`module verify` já aplicam.

### module submit

`copalibre module submit <caminho> [--upstream <owner/repo>] [--base <branch>]`

Bifurca `copalibre-modules`, copia o módulo local para um novo branch, o publica, e abre um pull
request.

- `--upstream <owner/repo>`: repositório de destino (padrão: `SebaSOFT/copalibre-modules`)
- `--base <branch>`: branch base do pull request (padrão: `main`)

## mcp

`copalibre mcp`

Inicia um servidor local Model Context Protocol (MCP) sobre stdio, para que uma IA possa operar o
CopaLibre. Veja o [detalhe das ferramentas MCP](/pt/help/cli/mcp/).
