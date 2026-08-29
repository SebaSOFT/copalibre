---
title: MCP para IA
description: Como uma IA pode operar o CopaLibre por meio de copalibre mcp.
capabilities: []
roles:
  - super-admin
  - admin
---

`copalibre mcp` inicia um servidor local [Model Context Protocol](https://modelcontextprotocol.io),
somente por stdio — sem transporte HTTP/SSE. Um cliente MCP (por exemplo, um agente de IA) inicia o
processo e se comunica pela sua entrada/saída padrão; as mensagens de log (o banner, etc.) vão por
stderr, nunca misturadas com o protocolo.

## Ferramentas de instalação

Sempre disponíveis, sem necessidade de configurar nenhum token — executam exatamente a mesma lógica
que seus comandos CLI equivalentes, no mesmo processo:

- **`copalibre_doctor`**: valida configuração e dependências (igual a `copalibre doctor`).
- **`copalibre_module_list`**: lista os módulos instalados.
- **`copalibre_upgrade_check`**: verifica compatibilidade de módulos e migrações pendentes contra
  uma versão alvo (`target_version`), igual a `copalibre upgrade-check`.

## Ferramentas de autoria de módulos

Sempre disponíveis, sem token — operam sobre o sistema de arquivos local e Git, nunca sobre
`apps/api`:

- **`copalibre_module_scaffold`**: gera um pacote de módulo estruturalmente válido, semeado a partir
  de um documento já válido do catálogo, como um repositório Git local etiquetado.
- **`copalibre_module_validate_local`**: valida um pacote local sem buscá-lo nem instalá-lo.
- **`copalibre_module_submit`**: bifurca `copalibre-modules`, publica o módulo em um novo branch, e
  abre um pull request.

Este é o cenário completo que justifica este servidor: uma IA lê as regras de um esporte, pergunta
ao operador os detalhes necessários, monta o módulo localmente, o valida, o instala em uma
instalação de desenvolvimento local para realmente testá-lo (via `copalibre module add --source
file://...`, sem mecanismo separado) e o envia como pull request — tudo sem sair do protocolo MCP.

## Ferramentas de operação de torneios

Registradas apenas quando `COPALIBRE_MCP_TOKEN` e `COPALIBRE_API_URL` estão configurados — sem
token, nem sequer aparecem na lista de ferramentas do servidor, e nenhuma chamada HTTP é tentada.
`COPALIBRE_MCP_TOKEN` é um token bearer já válido sob o mesmo contrato de autenticação OIDC/JWT que
o resto da API usa; este comando não emite nem gerencia tokens, apenas os encaminha.

- **`copalibre_get_organization`**: lê uma organização pelo seu alias.
- **`copalibre_list_tournaments`**: lista os torneios ativos (não arquivados) de uma organização.
- **`copalibre_get_tournament`**: lê um torneio pelo seu alias dentro de uma organização.
- **`copalibre_create_tournament`**: cria um torneio em estado de rascunho.
- **`copalibre_publish_tournament`**: publica a configuração de um torneio em rascunho.

Este é um conjunto inicial e selecionado, não um espelho exaustivo de cada endpoint de `apps/api` —
expandi-lo mais tarde é trabalho esperado, não um limite fixo.

## Configurando um cliente MCP

Um cliente MCP típico inicia `copalibre mcp` como um subprocesso, passando as variáveis de ambiente
necessárias (`DATABASE_URL`, e opcionalmente `COPALIBRE_MCP_TOKEN`/`COPALIBRE_API_URL` para as
ferramentas de torneio). Veja
[`docs/MCP.md`](https://github.com/SebaSOFT/copalibre/blob/develop/docs/MCP.md) no repositório para
um exemplo completo de configuração.

## Documentação para IA

O servidor MCP anuncia suas próprias `instructions` na resposta de `initialize` — o mesmo resumo
desta página, na forma que um cliente MCP lê antes de escolher uma ferramenta. Esta mesma instância
também publica `/llms.txt` e `/llms-full.txt` na raiz do site de ajuda, para uma IA que em vez disso
percorre as páginas renderizadas.
