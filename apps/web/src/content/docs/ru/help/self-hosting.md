---
title: 'Начало работы: самостоятельный хостинг'
description: Запустите CopaLibre из исходного кода на Windows, macOS или Linux, затем выберите топологию развёртывания с обратным прокси или Kubernetes.
---

Эта страница помогает запустить свежий чекаут на вашей собственной машине или сервере, а затем
объясняет два поддерживаемых способа выставить его перед реальным трафиком. Справочник команд CLI —
см. [Установка](/help/cli/installation/); подробности резервного копирования/восстановления и
постоянных данных — см. `docs/self-hosting.md` в репозитории.

## 1. Требования по платформам

Каждая роль поставляется как один многофункциональный образ Docker, собираемый прямо из этого
репозитория — отдельного этапа «продакшн-сборки» нет. Вам нужны Docker, Docker Compose v2 и Git;
больше ничего на хосте не запускается.

**Linux** — установите Docker Engine и плагин Compose из менеджера пакетов вашего дистрибутива или
[собственного репозитория Docker](https://docs.docker.com/engine/install/) (`docker-ce`,
`docker-compose-plugin`). Добавьте своего пользователя в группу `docker`, чтобы `./copalibre` не
требовал `sudo`.

**macOS** — установите [Docker Desktop](https://docs.docker.com/desktop/install/mac-install/) (Apple
Silicon или Intel). Colima вместе с автономными CLI `docker`/`docker-compose` тоже подойдёт, если вы
предпочитаете не запускать Docker Desktop.

**Windows** — установите [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/)
с включённым **бэкендом WSL2** и выполняйте каждую команду ниже изнутри дистрибутива WSL2 (Ubuntu —
наиболее протестированный вариант), а не напрямую из PowerShell или `cmd.exe`. `./copalibre` — это
POSIX-скрипт `sh`; WSL2 даёт ему настоящую оболочку и позволяет интеграции WSL Docker Desktop
предоставить ему доступ к демону без дополнительной сетевой настройки. Git Bash может в крайнем
случае выполнить `sh copalibre <command>`, но пути монтирования томов и права доступа к файлам более
предсказуемы под WSL2 — предпочитайте его для всего, что выходит за рамки быстрого локального теста.

## 2. Запуск из исходного кода

```bash
git clone https://github.com/SebaSOFT/copalibre.git
cd copalibre
./copalibre init      # записывает несекретные значения по умолчанию в .env, перечисляет нужные секреты
```

Отредактируйте `.env`: надёжный пароль PostgreSQL, непрозрачный `COPALIBRE_BOOTSTRAP_TOKEN`, ваши
значения OIDC JWKS/issuer/audience (либо встроенный провайдер идентификации email/пароль — см.
[Роли и права](/help/control/roles-permissions/)), публичный ID клиента браузера и один из
поддерживаемых поставщиков email.

```bash
./copalibre doctor    # проверяет конфигурацию перед тем, как что-либо запустится
./copalibre start     # docker compose up --detach --wait — собирает образы локально
./copalibre create-admin --organization-alias my-league --organization-name "My League" \
  --email admin@example.com
```

По умолчанию `./copalibre start` собирает `copalibre:local` и `copalibre-web:local` из этого
чекаута — именно эта сборка и есть «запуск из исходного кода». Вместо этого укажите
`COPALIBRE_IMAGE`/`COPALIBRE_WEB_IMAGE` на опубликованный тег, если предпочитаете скачать релиз, а не
собирать его.

На этом этапе стек работает, но недоступен извне хоста: `docker-compose.yml` намеренно никогда сам не
завершает TLS и не открывает публичный порт. Выберите одну из двух топологий ниже, чтобы реально
выставить его перед пользователями.

## 3. Выберите, как его открыть

### Вариант A — один хост, обратный прокси на границе

Простейшая поддерживаемая топология: один Docker-хост, выполняющий Compose, с Caddy или NGINX
впереди, которые завершают TLS и маршрутизируют к внутренним сервисам. Именно для этого по умолчанию
и предназначен `./copalibre start` на всех трёх платформах выше.

1. Задайте `COPALIBRE_APP_HOST`, `COPALIBRE_API_HOST` и `COPALIBRE_EVENTS_HOST` вашими публичными
   именами хостов, а также `ACME_EMAIL`, чтобы прокси мог автоматически запрашивать сертификаты.
2. Направьте обычный API-трафик на `api:3001`, SSE-трафик на `events:3002`, публичные SSR-маршруты на
   `web-ssr:3005`, а статический control/public веб-трафик на `web:4321`. Примеры конфигураций:
   [`deploy/proxy/Caddyfile`](https://github.com/SebaSOFT/copalibre/blob/main/deploy/proxy/Caddyfile)
   и [`deploy/proxy/nginx.conf`](https://github.com/SebaSOFT/copalibre/blob/main/deploy/proxy/nginx.conf).
   Прокси должен сохранять заголовки переадресации, держать SSE небуферизованным и давать
   бездействующим потокам переживать heartbeat-сигналы — именно поэтому пример Caddy задаёт
   `flush_interval -1`.
3. Проверьте это: `./copalibre doctor --check-proxy --proxy-url https://events.example/events/proxy-check`.

Это работает одинаково на Linux, macOS и Windows (WSL2) — прокси — это просто ещё один контейнер (или
процесс на том же хосте) перед тем же стеком Compose.

### Вариант B — Kubernetes (от K3s до корпоративных кластеров)

Для многоузловых, горизонтально масштабируемых развёртываний или управляемой инфраструктуры Helm-чарт
(`deploy/helm/copalibre/`) разворачивает те же образы, контракт окружения, проверки состояния и
процесс миграции, что и установка через Compose — установка со значениями по умолчанию ведёт себя
идентично одному базовому чарту.

```bash
helm install my-copalibre deploy/helm/copalibre/ \
  --set image.tag=<version> --set web.image.tag=<version>
```

Накладывайте эти аддитивные, отключённые по умолчанию группы `values.yaml` по мере необходимости — ни
одна не требует форка шаблона:

- **`autoscaling`** — HPA по ролям (`api` по частоте HTTP-запросов, `events` по активным
  SSE-соединениям, `worker` по глубине/возрасту очереди outbox) — требует адаптера пользовательских
  метрик (Prometheus Adapter, KEDA); ни один из этих трёх сигналов не является нативной метрикой
  Kubernetes.
- **`podDisruptionBudget`** и **`affinity.antiAffinity`** — защита от прерываний и мягкое
  распределение между узлами, независимо от автомасштабирования.
- **`networkPolicy`** — запрет по умолчанию по ролям, с `publicRoles` (по умолчанию `api`, `events`,
  плюс `web` всегда) открытыми для внешнего трафика.
- **`ingress`** — требует ingress-контроллер и, для автоматического TLS, cert-manager.
- **`externalSecrets`** — требует External Secrets Operator; получает `DATABASE_URL`, учётные данные
  `COPALIBRE_OBJECT_STORAGE_*` и т. д. из вашего настоящего хранилища секретов вместо простого
  манифеста `Secret`.

Управляемый PostgreSQL, S3-совместимое объектное хранилище (AWS S3, MinIO, R2, B2) или путь через
управляемую VM (Kamal, `docs/deployment/kamal.md`) — всё это конфигурация, а не изменения кода —
`packages/persistence` уже поддерживает их обобщённо. Проверяйте любое изменение чарта локально на
одноразовом многоузловом кластере, прежде чем трогать реальный:

```bash
k3d cluster create --config deploy/helm/k3s-dev-cluster.yaml
```

Полный список требований и измеренные доказательства многоузлового отказоустойчивого переключения,
резервного копирования-восстановления и безопасности обновлений, на которых основано это
утверждение: `docs/deployment/enterprise-kubernetes.md` в репозитории.

## 4. Дальнейшие шаги

- [Ваш первый турнир](/help/getting-started/) — создайте и опубликуйте соревнование, как только
  установка заработает.
- [Эксплуатация и прослеживаемость](/help/operations/) — проведение матчей и безопасное исправление
  результатов.
- [Справочник CLI](/help/cli/commands/) — каждая подкоманда `copalibre`, включая `backup`, `restore`
  и `upgrade-check`.
