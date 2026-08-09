---
title: Установка
description: Как установить CopaLibre с нуля с помощью CLI copalibre.
---

## Требования

Docker и Docker Compose на хосте. Устанавливать PostgreSQL или его клиентские инструменты не
требуется — они работают внутри контейнеров, которыми управляет `copalibre`.

## Шаги

```bash
git clone https://github.com/SebaSOFT/copalibre.git
cd copalibre
./copalibre init      # записывает несекретные значения по умолчанию в .env
```

Отредактируйте `.env`: пароль PostgreSQL, `COPALIBRE_BOOTSTRAP_TOKEN`, JWKS/issuer/audience OIDC,
ID клиента браузера и провайдера электронной почты.

```bash
./copalibre doctor    # проверяет конфигурацию перед запуском чего-либо
./copalibre start     # поднимает PostgreSQL, запускает doctor и все процессы
./copalibre create-admin --organization-alias moya-liga --organization-name "Моя лига" --email admin@example.com
```

`docker-compose.yml` намеренно не завершает TLS — обратный прокси (Caddy или NGINX) размещается на
границе. Примеры конфигураций находятся в `deploy/proxy/`; проверьте установку с помощью
`./copalibre doctor --check-proxy --proxy-url https://events.example/events/proxy-check`.

Полная информация о постоянных данных, резервном копировании/восстановлении и обратном прокси:
`docs/self-hosting.md` в репозитории.
