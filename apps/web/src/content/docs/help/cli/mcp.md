---
title: MCP para IA
description: Cómo una IA puede operar CopaLibre mediante copalibre mcp.
---

`copalibre mcp` arranca un servidor [Model Context Protocol](https://modelcontextprotocol.io) local,
sobre stdio únicamente — sin transporte HTTP/SSE. Un cliente MCP (por ejemplo, un agente de IA)
arranca el proceso y se comunica por su entrada/salida estándar; los mensajes de bitácora (el
banner, etc.) van por stderr, nunca mezclados con el protocolo.

## Herramientas de instalación

Siempre disponibles, sin necesidad de configurar ningún token — ejecutan la misma lógica que sus
comandos CLI equivalentes, en el mismo proceso:

- **`copalibre_doctor`**: valida configuración y dependencias (igual que `copalibre doctor`).
- **`copalibre_module_list`**: lista los módulos instalados.
- **`copalibre_upgrade_check`**: chequea compatibilidad de módulos y migraciones pendientes contra
  una versión objetivo (`target_version`), igual que `copalibre upgrade-check`.

## Herramientas de operación de torneos

Solo se registran cuando `COPALIBRE_MCP_TOKEN` y `COPALIBRE_API_URL` están configurados — sin token,
ni siquiera aparecen en la lista de herramientas del servidor, y nunca se intenta ninguna llamada
HTTP. `COPALIBRE_MCP_TOKEN` es un token bearer ya válido bajo el mismo contrato de autenticación
OIDC/JWT que usa el resto de la API; este comando no emite ni gestiona tokens, solo los reenvía.

- **`copalibre_get_organization`**: lee una organización por su alias.
- **`copalibre_list_tournaments`**: lista los torneos activos (no archivados) de una organización.
- **`copalibre_get_tournament`**: lee un torneo por su alias dentro de una organización.
- **`copalibre_create_tournament`**: crea un torneo en estado borrador.
- **`copalibre_publish_tournament`**: publica la configuración de un torneo borrador.

Este es un conjunto inicial curado, no un espejo exhaustivo de cada endpoint de `apps/api` —
ampliarlo más adelante es un trabajo esperado, no un límite fijo.

## Configurar un cliente MCP

Un cliente MCP típico arranca `copalibre mcp` como subproceso, pasando las variables de entorno
necesarias (`DATABASE_URL`, y opcionalmente `COPALIBRE_MCP_TOKEN`/`COPALIBRE_API_URL` para las
herramientas de torneo). Ver [`docs/MCP.md`](https://github.com/SebaSOFT/copalibre/blob/develop/docs/MCP.md)
en el repositorio para un ejemplo completo de configuración.
