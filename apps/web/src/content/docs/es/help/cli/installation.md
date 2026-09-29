---
title: Instalación
description: Cómo instalar CopaLibre desde cero con el CLI copalibre.
capabilities: []
roles:
  - super-admin
---

## Requisitos

Docker y Docker Compose en el host. `copalibre` es un binario independiente — no hace falta
instalar Node.js. Tampoco hace falta instalar PostgreSQL ni sus herramientas cliente: corren
dentro de los contenedores que administra `copalibre`.

`install.sh` soporta Linux (x86_64/arm64), macOS (x86_64/arm64, incluyendo Apple Silicon bajo
Rosetta) y Windows (x86_64).

## Pasos

Ejecute estos comandos en Bash (en Windows, WSL2 o Git Bash). La exportación de PATH habilita el directorio del instalador en la sesión actual. Para elegir una versión publicada, envíe el script a `VERSION=1.2.0 bash`; esa versión debe estar publicada.

```bash
curl -fsSL https://github.com/SebaSOFT/copalibre/releases/latest/download/install.sh | bash
export PATH="$HOME/.copalibre/bin:$PATH"
mkdir mi-liga && cd mi-liga
copalibre init      # escribe valores por defecto no secretos en .env
```

Edite `.env`: contraseña de PostgreSQL, `COPALIBRE_BOOTSTRAP_TOKEN`, JWKS/issuer/audience de OIDC,
ID de cliente del navegador, y un proveedor de email.

Antes de iniciar, configure `GARAGE_RPC_SECRET` en `.env` con un valor generado por `openssl rand -hex 32`; Compose lo exige incluso sin almacenamiento opcional.

```bash
copalibre doctor    # valida configuración antes de arrancar nada
copalibre start     # levanta PostgreSQL, corre doctor, y arranca todos los procesos
copalibre create-admin --organization-alias mi-liga --organization-name "Mi Liga" --email admin@ejemplo.com
```

`docker-compose.yml` no termina TLS a propósito — un proxy inverso (Caddy o NGINX) va al borde. Hay
configuraciones de ejemplo en `deploy/proxy/`; verifique la instalación con
`copalibre doctor --check-proxy --proxy-url https://eventos.ejemplo/events/proxy-check`.

Detalle completo de datos persistentes, respaldo/restauración y el proxy inverso: `docs/self-hosting.md`
en el repositorio. Actualizar el binario `copalibre` en sí: [Actualización](/es/help/cli/updating/).
