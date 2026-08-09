---
title: Referência de comandos
description: Cada comando do CLI copalibre, seu uso e suas flags.
---

Cada comando responde a `--help`/`-h` com exatamente este texto de uso, gerado a partir de uma única
fonte dentro do próprio CLI — esta página não pode descrever um comando de forma diferente do que o
CLI realmente faz.

## init

`copalibre init [--file <caminho>]`

Grava valores padrão não secretos e lista os segredos necessários.

- `--file <caminho>`: arquivo de destino (padrão `.env`)

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
com a versão alvo. Veja [atualização](/help/cli/updating/) para a sequência completa.

## create-admin

`copalibre create-admin --organization-alias <alias> --organization-name <nome> --email <email>`

Cria a primeira conta de administrador de uma organização.

## module

`copalibre module <add|list|remove|verify>`

Gerencia os módulos de disciplina e perfil de torneio instalados.

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
CopaLibre. Veja o [detalhe das ferramentas MCP](/help/cli/mcp/).
