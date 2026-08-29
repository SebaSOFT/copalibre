---
title: Установка
description: Как установить CopaLibre с нуля с помощью CLI copalibre.
capabilities: []
roles:
  - super-admin
---

## Требования

Docker и Docker Compose на хосте. `copalibre` — самостоятельный бинарный файл: установка Node.js не
требуется. Устанавливать PostgreSQL или его клиентские инструменты тоже не требуется — они работают
внутри контейнеров, которыми управляет `copalibre`.

`install.sh` поддерживает Linux (x86_64/arm64), macOS (x86_64/arm64, включая Apple Silicon через
Rosetta) и Windows (x86_64).

## Шаги

```bash
curl -fsSL https://www.copalibre.app/install.sh | bash
mkdir moya-liga && cd moya-liga
copalibre init      # записывает несекретные значения по умолчанию в .env
```

Отредактируйте `.env`: пароль PostgreSQL, `COPALIBRE_BOOTSTRAP_TOKEN`, JWKS/issuer/audience OIDC,
ID клиента браузера и провайдера электронной почты.

```bash
copalibre doctor    # проверяет конфигурацию перед запуском чего-либо
copalibre start     # поднимает PostgreSQL, запускает doctor и все процессы
copalibre create-admin --organization-alias moya-liga --organization-name "Моя лига" --email admin@example.com
```

`docker-compose.yml` намеренно не завершает TLS — обратный прокси (Caddy или NGINX) размещается на
границе. Примеры конфигураций находятся в `deploy/proxy/`; проверьте установку с помощью
`copalibre doctor --check-proxy --proxy-url https://events.example/events/proxy-check`.

Полная информация о постоянных данных, резервном копировании/восстановлении и обратном прокси:
`docs/self-hosting.md` в репозитории. Обновление самого бинарного файла `copalibre`:
[Обновление](/ru/help/cli/updating/).
