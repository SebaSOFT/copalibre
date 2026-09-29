---
title: Atualização
description: O caminho não destrutivo para atualizar o framework CopaLibre e seus módulos instalados.
capabilities: []
roles:
  - super-admin
---

## Atualizar o próprio CLI copalibre

`copalibre --version` imprime a versão do binário instalado. Executar o script de instalação
novamente busca a última release publicada e substitui o binário no lugar — é idempotente: verifica
primeiro a versão instalada e pula o download se ela já corresponder:

```bash
curl -fsSL https://github.com/SebaSOFT/copalibre/releases/latest/download/install.sh | bash
```

Isso substitui apenas o binário `copalibre`. Não tem efeito sobre uma instalação em execução — veja
abaixo para atualizar o framework e seus módulos.

## Atualizar o framework

Mantenha o CLI correspondente a `.copalibre/installation.json`. Trocar o binário não atualiza marcador, Compose ou imagens. Faça backup de PostgreSQL, objetos, configuração e chaves de assinatura; guarde as versões anteriores das imagens.

```bash
copalibre backup --file backups/pre-upgrade.tar.gz
```

No diretório existente, revise as mudanças de Compose/configuração da versão alvo e altere ambas as imagens em `.env`. Preserve projeto Compose e volumes. Baixe e verifique a imagem alvo sem iniciar dependências nem aplicar migrações:

```dotenv
COPALIBRE_IMAGE=ghcr.io/sebasoft/copalibre:1.2.0
COPALIBRE_WEB_IMAGE=ghcr.io/sebasoft/copalibre-web:1.2.0
```

```bash
docker compose pull
docker compose run --rm --no-deps upgrade-check --target-version 1.2.0
```

Após a verificação, programe uma interrupção, pare os processos da aplicação e faça um backup final; depois migre e reinicie. Não reinicie se a migração falhar:

```bash
docker compose stop gateway web web-ssr api events worker scheduler
copalibre backup --file backups/pre-upgrade.tar.gz
docker compose run --rm migrate && docker compose up --detach --wait
docker compose run --rm doctor
```

Não exclua nem reescreva o marcador para contornar a versão. Para operações de esquema entre versões, use os serviços Compose explícitos acima; o CLI novo recusa `migrate` e `upgrade-check` com o marcador antigo. Um novo diretório `init` é outra instalação, não uma atualização no mesmo local.

Após uma migração, selecionar imagens antigas não é uma reversão segura. Mantenha os processos de escrita parados e restaure os backups de PostgreSQL, objetos e configuração em uma instalação isolada da versão anterior. Verifique a recuperação antes de mudar o tráfego; gravações posteriores ao backup são perdidas.

## Atualização por tipo de implantação

Com Compose atrás de NGINX ou Caddy, preserve proxy e certificados, use manutenção durante a migração e valide/recarregue apenas a configuração alterada. No Kubernetes, use o chart alvo com valores revisados e ambas as imagens, execute primeiro um Job de compatibilidade e verifique os Jobs de migração/doctor e o ingress antes de reabrir o tráfego. Helm rollback não desfaz migrações do banco. Comandos detalhados:

- [Caddy](https://github.com/SebaSOFT/copalibre/blob/main/docs/deployment/reverse-proxy/caddy.md#upgrading-copalibre-behind-caddy)
- [NGINX](https://github.com/SebaSOFT/copalibre/blob/main/docs/deployment/reverse-proxy/nginx.md#upgrading-copalibre-behind-nginx)
- [Kubernetes / Helm](https://github.com/SebaSOFT/copalibre/blob/main/docs/deployment/enterprise-kubernetes.md#upgrading-an-existing-helm-release-safely)

## Atualizar módulos

Cada disciplina ou perfil de torneio instalado é um módulo versionado independentemente do
framework.

```bash
copalibre module list --outdated
```

Lista apenas os módulos instalados que têm uma versão publicada mais nova que a instalada.

```bash
copalibre module add <alias>@<intervalo>
```

Instala uma versão específica ou um intervalo (por exemplo `@^2.0.0`) de um módulo já instalado —
reinstalar com uma versão diferente é a forma de atualizar um módulo. Um torneio já iniciado
continua referenciando a versão com a qual foi criado; atualizar um módulo nunca muda
retroativamente um torneio já em andamento.

Veja a [referência de comandos](/pt/help/cli/commands/) para o restante das opções de `module`.
