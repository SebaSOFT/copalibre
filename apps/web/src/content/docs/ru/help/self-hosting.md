---
title: 'Начало работы: самостоятельный хостинг'
description: Запустите CopaLibre из исходного кода на Windows, macOS или Linux, затем выберите топологию развёртывания с обратным прокси или Kubernetes.
capabilities:
  - platform/self-hosted-deployment
roles:
  - super-admin
---

Эта страница помогает запустить свежий чекаут на вашей собственной машине или сервере, а затем
объясняет два поддерживаемых способа выставить его перед реальным трафиком. Справочник команд CLI —
см. [Установка](/help/cli/installation/); подробности резервного копирования/восстановления и
постоянных данных — см. `docs/self-hosting.md` в репозитории.

## 1. Требования по платформам

Нужны Docker, Docker Compose v2 и Git. Обёртке из исходного кода также нужны Node.js 24 и Corepack на хосте. Отдельному бинарному CLI Node.js не нужен; см. [Установка](/ru/help/cli/installation/).

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

Соберите оба образа из корня репозитория, затем создайте установку в пустом каталоге:

```bash
git clone https://github.com/SebaSOFT/copalibre.git
cd copalibre
docker build --target runtime -t copalibre:local .
docker build --target web -t copalibre-web:local .
mkdir my-league && cd my-league
../copalibre init
```

Перед запуском измените `.env`: задайте `COPALIBRE_IMAGE=copalibre:local` и `COPALIBRE_WEB_IMAGE=copalibre-web:local` для этих сборок. Иначе `init` выбирает опубликованные образы версии CLI. Замените пароли разработки и bootstrap-токен; настройте идентификацию, почту и публичные URL. Задайте `GARAGE_RPC_SECRET` через `openssl rand -hex 32`: Compose подставляет это обязательное значение даже при отключённом дополнительном хранилище.

```bash
../copalibre doctor
../copalibre start
../copalibre status
../copalibre restart
../copalibre stop
../copalibre create-admin --organization-alias my-league --organization-name "My League" --email admin@example.com
```

Используйте copalibre status для проверки контейнеров и шлюза. copalibre restart проверяет PostgreSQL и doctor перед повторным запуском служб. copalibre stop сохраняет тома; --down удаляет контейнеры и сети. В Kubernetes команды start/stop/restart выводят инструкции Helm или kubectl.

Шлюз публикует HTTP на `http://localhost:8080` (`COPALIBRE_PORT`). Compose также публикует порты сервисов; ограничьте доступ на уровне хоста и сети. TLS завершается на внешнем прокси.

## 3. Выберите, как его открыть

### Вариант A — один хост, обратный прокси на границе

Направьте домен приложения на `gateway:80` в сети Compose или `127.0.0.1:8080`, если прокси работает на хосте. Шлюз маршрутизирует API, аутентификацию, SSE и web на одном origin; web-контейнер передаёт динамические страницы в `web-ssr`. Используйте `deploy/proxy/Caddyfile` или `deploy/proxy/nginx.conf`, настройте TLS и публичные URL, отключите буферизацию SSE. Отдельные домены API/events необязательны при едином origin.

```bash
../copalibre doctor --check-proxy --proxy-url https://app.example/events/proxy-check
```

### Вариант B — Kubernetes (от K3s до корпоративных кластеров)

Для многоузловых, горизонтально масштабируемых развёртываний или управляемой инфраструктуры Helm-чарт
(`deploy/helm/copalibre/`) разворачивает те же образы, контракт окружения, проверки состояния и
процесс миграции, что и установка через Compose — установка со значениями по умолчанию ведёт себя
идентично одному базовому чарту.

Запускайте Helm из корня репозитория после настройки `my-values.yaml`: база данных, идентификация, почта и публичные URL. Для обоих образов используйте опубликованную версию; 1.2.6 станет доступна после публикации.

```bash
cd ..
helm show values deploy/helm/copalibre/ > my-values.yaml
```

```bash
helm install my-copalibre deploy/helm/copalibre/ -f my-values.yaml \
  --set image.repository=ghcr.io/sebasoft/copalibre --set-string image.tag=1.2.6 \
  --set web.image.repository=ghcr.io/sebasoft/copalibre-web --set-string web.image.tag=1.2.6
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

Управляемый PostgreSQL, S3-совместимое объектное хранилище (AWS S3, Garage, R2, B2) или путь через
управляемую VM (Kamal, `docs/deployment/kamal.md`) — всё это конфигурация, а не изменения кода —
`packages/persistence` уже поддерживает их обобщённо. Проверяйте любое изменение чарта локально на
одноразовом многоузловом кластере, прежде чем трогать реальный:

```bash
k3d cluster create --config deploy/helm/k3s-dev-cluster.yaml
```

Полный список требований и измеренные доказательства многоузлового отказоустойчивого переключения,
резервного копирования-восстановления и безопасности обновлений, на которых основано это
утверждение: `docs/deployment/enterprise-kubernetes.md` в репозитории.

## 4. Уведомления по электронной почте

О событиях турниров и организации сообщается по электронной почте через провайдера, настроенного для приглашений (`COPALIBRE_EMAIL_PROVIDER`); дополнительных настроек не требуется. В среде разработки письма попадают в Mailpit.

- О новом турнире и новом клубе сообщается администраторам организации.
- О новой регистрации и об отправке клубом состава сообщается администраторам организации и администраторам этого турнира. Инициатор события письмо не получает.
- Письма используют основной язык организации, содержат её эмблему и название в шапке и подписаны Copa Libre со ссылкой на [copalibre.app](https://copalibre.app).
- Импорт CSV и `copalibre dev demo` письма не отправляют.
- Одно и то же письмо никогда не отправляется одному получателю дважды. Если провайдер не успевает подтвердить отправку, письмо не повторяется, поэтому оно может не дойти, но не продублируется.

## 5. Дальнейшие шаги

- [Ваш первый турнир](/help/getting-started/) — создайте и опубликуйте соревнование, как только
  установка заработает.
- [Эксплуатация и прослеживаемость](/help/operations/) — проведение матчей и безопасное исправление
  результатов.
- [Справочник CLI](/help/cli/commands/) — каждая подкоманда `copalibre`, включая `backup`, `restore`
  и `upgrade-check`.
