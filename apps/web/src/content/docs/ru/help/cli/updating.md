---
title: Обновление
description: Неразрушающий путь обновления фреймворка CopaLibre и установленных модулей.
capabilities: []
roles:
  - super-admin
---

## Обновление самого CLI copalibre

`copalibre --version` выводит версию установленного бинарного файла. Повторный запуск скрипта
установки загружает последний опубликованный релиз и заменяет бинарный файл на месте — это
идемпотентно: сначала проверяется установленная версия, и загрузка пропускается, если она уже
совпадает:

```bash
curl -fsSL https://github.com/SebaSOFT/copalibre/releases/latest/download/install.sh | bash
```

Это заменяет только бинарный файл `copalibre`. Это не влияет на работающую установку — см. ниже об
обновлении фреймворка и его модулей.

## Обновление фреймворка

Сохраните CLI, соответствующий `.copalibre/installation.json`. Замена бинарного файла не обновляет маркер, Compose и версии образов. Сохраните резервные копии PostgreSQL, объектов, конфигурации и ключей подписи, а также прежние версии образов.

```bash
copalibre backup --file backups/pre-upgrade.tar.gz
```

В существующем каталоге установки проверьте изменения Compose и конфигурации целевой версии, затем измените оба образа в `.env`. Сохраните проект Compose и тома. Загрузите и проверьте целевой образ без запуска зависимостей и применения миграций:

```dotenv
COPALIBRE_IMAGE=ghcr.io/sebasoft/copalibre:1.2.6
COPALIBRE_WEB_IMAGE=ghcr.io/sebasoft/copalibre-web:1.2.6
```

```bash
docker compose pull
docker compose run --rm --no-deps upgrade-check --target-version 1.2.6
```

После успешной проверки запланируйте перерыв, остановите процессы приложения и создайте окончательную резервную копию; затем выполните миграцию и запуск. Не запускайте приложение при ошибке миграции:

```bash
docker compose stop gateway web web-ssr api events worker scheduler
copalibre backup --file backups/pre-upgrade.tar.gz
docker compose run --rm migrate && docker compose up --detach --wait
docker compose run --rm doctor
```

Не удаляйте и не переписывайте маркер для обхода проверки версии. Для операций со схемой между версиями используйте указанные сервисы Compose: новый CLI откажет в `migrate` и `upgrade-check` со старым маркером. Новый каталог `init` — отдельная установка, а не обновление существующей.

После миграции базы выбор старых образов не является безопасным откатом. Оставьте процессы записи остановленными и восстановите PostgreSQL, объекты и конфигурацию в изолированной установке прежней версии. Проверьте восстановление до переключения трафика; записи после резервной копии будут потеряны.

## Обновление по типу развёртывания

Для Compose за NGINX или Caddy сохраните прокси и сертификаты, включите обслуживание на время миграции и проверяйте/перезагружайте только изменённую конфигурацию. В Kubernetes используйте целевой chart с проверенными значениями и обоими образами, сначала запустите Job проверки совместимости, затем проверьте Job миграции/doctor и ingress до открытия трафика. Helm rollback не отменяет миграции базы. Подробные команды:

- [Caddy](https://github.com/SebaSOFT/copalibre/blob/main/docs/deployment/reverse-proxy/caddy.md#upgrading-copalibre-behind-caddy)
- [NGINX](https://github.com/SebaSOFT/copalibre/blob/main/docs/deployment/reverse-proxy/nginx.md#upgrading-copalibre-behind-nginx)
- [Kubernetes / Helm](https://github.com/SebaSOFT/copalibre/blob/main/docs/deployment/enterprise-kubernetes.md#upgrading-an-existing-helm-release-safely)

## Обновление модулей

Каждая установленная дисциплина или профиль турнира — это модуль, версионируемый независимо от
фреймворка.

```bash
copalibre module list --outdated
```

Показывает только установленные модули, у которых опубликованная версия новее установленной.

```bash
copalibre module add <alias>@<диапазон>
```

Устанавливает конкретную версию или диапазон (например, `@^2.0.0`) уже установленного модуля —
переустановка с другой версией является способом обновления модуля. Уже начатый турнир продолжает
ссылаться на версию, с которой он был создан; обновление модуля никогда не изменяет задним числом
уже идущий турнир.

Смотрите [справочник команд](/ru/help/cli/commands/) для остальных опций `module`.
