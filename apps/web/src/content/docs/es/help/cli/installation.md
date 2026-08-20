---
title: Instalación
description: Cómo instalar CopaLibre desde cero con el CLI copalibre.
---

## Requisitos

Docker y Docker Compose en el host. `copalibre` es un binario independiente — no hace falta
instalar Node.js. Tampoco hace falta instalar PostgreSQL ni sus herramientas cliente: corren
dentro de los contenedores que administra `copalibre`.

`install.sh` soporta Linux (x86_64/arm64), macOS (x86_64/arm64, incluyendo Apple Silicon bajo
Rosetta) y Windows (x86_64).

## Pasos

```bash
curl -fsSL https://www.copalibre.app/install.sh | bash
mkdir mi-liga && cd mi-liga
copalibre init      # escribe valores por defecto no secretos en .env
```

Edite `.env`: contraseña de PostgreSQL, `COPALIBRE_BOOTSTRAP_TOKEN`, JWKS/issuer/audience de OIDC,
ID de cliente del navegador, y un proveedor de email.

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
