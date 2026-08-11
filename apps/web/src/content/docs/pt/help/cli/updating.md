---
title: Atualização
description: O caminho não destrutivo para atualizar o framework CopaLibre e seus módulos instalados.
---

## Atualizar o framework

Sequência recomendada, não destrutiva:

1. **Faça backup** antes de mexer em qualquer coisa: `./copalibre backup --file backups/pre-upgrade.dump`.
2. **Atualize** o checkout ou a referência da imagem para a nova versão (não reinicie os serviços
   ainda).
3. **Verifique a compatibilidade** com a nova versão, sem reiniciar nada:
   ```bash
   ./copalibre upgrade-check --target-version <nova-versao>
   ```
   Relata se algum módulo instalado deixaria de ser compatível com essa versão (a mesma verificação
   que `module verify` usa contra a versão em execução, mas contra a versão alvo), e lista as
   migrações de banco de dados pendentes — sem aplicar nenhuma delas. Termina com código de saída
   diferente de zero se algum módulo ficaria incompatível; corrija isso antes de continuar.
4. **Reinicie** com a nova versão (`./copalibre start` ou `docker compose up --detach --wait`). As
   migrações pendentes se aplicam automaticamente, em ordem, antes que qualquer papel de processo
   comece a servir tráfego — não é uma etapa manual separada.

## Atualizar módulos

Cada disciplina ou perfil de torneio instalado é um módulo versionado independentemente do
framework.

```bash
./copalibre module list --outdated
```

Lista apenas os módulos instalados que têm uma versão publicada mais nova que a instalada.

```bash
./copalibre module add <alias>@<intervalo>
```

Instala uma versão específica ou um intervalo (por exemplo `@^2.0.0`) de um módulo já instalado —
reinstalar com uma versão diferente é a forma de atualizar um módulo. Um torneio já iniciado
continua referenciando a versão com a qual foi criado; atualizar um módulo nunca muda
retroativamente um torneio já em andamento.

Veja a [referência de comandos](/help/cli/commands/) para o restante das opções de `module`.
