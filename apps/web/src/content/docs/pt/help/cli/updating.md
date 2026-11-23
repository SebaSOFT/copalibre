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

Execute `copalibre upgrade` no diretório da instalação, com o CLI da versão para a qual vai mudar.
Primeiro veja o que ele fará; isso não altera nada:

```bash
copalibre upgrade --check
```

### De onde você parte

| Sua instalação foi criada por                    | Faça isto                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 1.2.5 ou 1.2.6                                   | `copalibre upgrade --self`, depois `copalibre upgrade --check` e `copalibre upgrade`                          |
| 1.2.1 ou anterior (o CLI dela não tem `upgrade`) | Instale o novo CLI com o script de instalação acima, depois `copalibre upgrade --check` e `copalibre upgrade` |
| Um CLI 1.2.x já executou `copalibre upgrade`     | Instale o novo CLI e execute `copalibre upgrade` de novo                                                      |

Não deixe um CLI 1.2.x executar `copalibre upgrade` sozinho. Ele grava a nova versão em `.env`,
`docker-compose.yml` e `.copalibre/installation.json`, informa sucesso e deixa todos os contêineres
nas imagens antigas; na próxima reinicialização, as imagens novas sobem sobre o arquivo Compose
antigo, e isso não funciona. O novo CLI reconhece uma instalação deixada assim, diga o que disser o
marcador dela, e conclui o trabalho.

### O que a atualização faz

1. Baixa as novas imagens enquanto a instalação continua funcionando, para que nada pare se faltar
   alguma.
2. Para a pilha, para que nenhuma gravação se perca, e faz backup do banco em
   `backups/pre-upgrade-<de>-to-<para>-<data>.tar.gz`.
3. Substitui `docker-compose.yml` e `deploy/gateway/Caddyfile` pelos da nova versão, quando ainda
   estão como uma versão os distribuiu, e mantém os anteriores como `docker-compose.yml.<de>.bak` e
   `deploy/gateway/Caddyfile.<de>.bak`. Atualiza o `.env` (novas configurações, novas tags de imagem,
   o endereço do conjunto de chaves que passou para `/api`) e mantém `.env.<de>.bak`; os valores que
   você definiu são preservados.
4. Move o banco do PostgreSQL 17 para o 18: restaura o backup em um volume novo (`postgresql-data`) e
   compara o número de linhas de cada tabela antes de continuar. O volume do 17 não é tocado.
5. Inicia a nova versão e executa `copalibre doctor`. Em um terminal, o doctor oferece configurar o que
   falta à instalação, como o envio de e-mails; veja [doctor](/pt/help/cli/commands/#doctor).
6. Quando o doctor passa, verifica que o backup pode ser lido de volta e então remove o volume do
   PostgreSQL 17 (`postgres-data`) e a imagem `postgres:17`. Com `--keep-old-volume`, eles são
   mantidos; a atualização mostra os dois comandos para removê-los depois.

A pilha fica parada do passo 2 até o passo 5 dar certo; planeje a janela pelo tamanho do seu banco. A
mudança precisa de espaço livre no disco do Docker com o dobro do tamanho do banco: sem ele, a atualização não começa.
Copie o pacote de backup para fora do servidor quando a atualização terminar.

### Se você alterou o docker-compose.yml

Um arquivo Compose que não corresponde a nenhuma versão (um serviço que você adicionou, um valor que
mudou) fica como está. A atualização grava o arquivo da nova versão como `docker-compose.yml.new`,
avisa e para antes de mudar qualquer outra coisa. Leve suas alterações para esse arquivo, substitua o
`docker-compose.yml` pelo resultado e execute `copalibre upgrade` de novo. Uma configuração do gateway
que você alterou é mantida, e a atualização avisa.

### Instalações da 1.0

A 1.0 não tinha gateway: o proxy de borda chegava diretamente a `web`, `api` e `events`. Desde a
1.1, o serviço `gateway` é a única entrada, em `COPALIBRE_PORT` (8080 se não definido). Depois da
atualização, aponte seu proxy para o gateway e defina `COPALIBRE_APP_URL` com o endereço que os
navegadores usam; execute `copalibre doctor` para confirmar.

### Voltar atrás

Se qualquer passo antes do doctor falhar, a atualização recoloca os arquivos anteriores, inicia a
versão anterior sobre o seu volume intacto do PostgreSQL 17 e informa por que parou. Se o doctor
falhar, a nova versão continua rodando e a atualização mostra estes passos sem remover nada.

Enquanto o volume do PostgreSQL 17 existir (o doctor falhou, ou você usou `--keep-old-volume`):

```bash
docker compose down
cp docker-compose.yml.<de>.bak docker-compose.yml
cp .env.<de>.bak .env
cp deploy/gateway/Caddyfile.<de>.bak deploy/gateway/Caddyfile   # se a atualização o substituiu
docker compose up --detach --wait
```

O volume do PostgreSQL 18 (`<projeto>_postgresql-data`) fica sem uso; remova-o com
`docker volume rm` antes de tentar a atualização de novo se quiser começar do zero.

Depois que a atualização removeu o PostgreSQL 17, o caminho de volta é o pacote de backup. Instale o
CLI da versão anterior em um diretório novo e vazio, execute `copalibre init` nele, copie o pacote
para o `backups/` dele e restaure-o:

```bash
copalibre restore --file backups/pre-upgrade-<de>-to-<para>-<data>.tar.gz --confirm
```

As gravações posteriores à atualização se perdem. Voltar a imagens anteriores sobre o banco já
migrado nunca é uma forma segura de voltar atrás.

### Procedimento manual com Compose (entre versões 2.x)

A partir de uma instalação 1.x, use `copalibre upgrade`: o banco dela precisa passar para o
PostgreSQL 18, o que estes passos não fazem.

Mantenha o CLI correspondente a `.copalibre/installation.json`. Trocar o binário não atualiza marcador, Compose ou imagens. Faça backup de PostgreSQL, objetos, configuração e chaves de assinatura; guarde as versões anteriores das imagens.

```bash
copalibre backup --file backups/pre-upgrade.tar.gz
```

No diretório existente, revise as mudanças de Compose/configuração da versão alvo e altere ambas as imagens em `.env`. Preserve projeto Compose e volumes. Baixe e verifique a imagem alvo sem iniciar dependências nem aplicar migrações:

```dotenv
COPALIBRE_IMAGE=ghcr.io/sebasoft/copalibre:1.2.6
COPALIBRE_WEB_IMAGE=ghcr.io/sebasoft/copalibre-web:1.2.6
```

```bash
docker compose pull
docker compose run --rm --no-deps upgrade-check --target-version 1.2.6
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
