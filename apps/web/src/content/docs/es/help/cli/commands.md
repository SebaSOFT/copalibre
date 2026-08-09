---
title: Referencia de comandos
description: Cada comando del CLI copalibre, su uso y sus flags.
---

Cada comando responde `--help`/`-h` con este mismo texto de uso, generado desde una única fuente
en el propio CLI — esta página no puede describir un comando distinto de lo que el CLI realmente
hace.

## init

`copalibre init [--file <ruta>]`

Escribe valores por defecto no secretos y lista los secretos requeridos.

- `--file <ruta>`: archivo destino (por defecto `.env`)

## doctor

`copalibre doctor [--check-proxy] [--proxy-url <url>]`

Valida configuración y dependencias antes de arrancar.

- `--check-proxy`: además verifica la configuración del proxy inverso
- `--proxy-url <url>`: URL pública a probar cuando se usa `--check-proxy`

## dev

`copalibre dev [--hybrid]`

Corre un entorno de desarrollo, contenerizado o híbrido.

- `--hybrid`: infraestructura en Docker, procesos de aplicación en el host

## start

`copalibre start`

Levanta PostgreSQL, corre doctor, y arranca todos los roles de proceso.

## migrate

`copalibre migrate`

Corre las migraciones de base de datos pendientes.

## backup

`copalibre backup [--file <ruta>] [--retain <n>] [--dry-run]`

Crea un **paquete de respaldo** comprimido (`.tar.gz`) bajo `backups/`, con el volcado de PostgreSQL
y un manifiesto (fecha y versión de CopaLibre). Aplica retención: después de un respaldo exitoso,
borra los paquetes más viejos que excedan `--retain`. Solo borra archivos que coinciden con el
patrón de nombre de paquete (`copalibre-<fecha>.tar.gz`) — nunca toca otros archivos en `backups/`.

- `--file <ruta>`: destino del paquete, dentro de `backups/` (por defecto: nombre con fecha)
- `--retain <n>`: paquetes a conservar después de este respaldo (por defecto: 5)
- `--dry-run`: imprime el plan de respaldo sin ejecutarlo

Los datos de módulos instalados (descriptores de disciplina, perfiles de torneo) están en
PostgreSQL, así que quedan incluidos en el volcado. Los bytes de objetos en almacenamiento de
objetos (`object-storage-data`) están fuera del alcance de este comando — respáldelos por separado
a nivel de infraestructura, como ya indica la guía de autoalojamiento.

## restore

`copalibre restore --file <ruta> (--confirm | --dry-run) [--allow-newer-backup]`

Extrae un paquete de respaldo, restaura su volcado de PostgreSQL, corre las migraciones pendientes
y confirma que el esquema aplicado coincide con esta instalación — todo en una sola invocación.

- `--file <ruta>`: paquete a restaurar, dentro de `backups/`
- `--confirm`: requerido para ejecutar la restauración de verdad
- `--dry-run`: imprime el plan de restauración sin ejecutarlo
- `--allow-newer-backup`: permite restaurar un paquete producido por una versión de CopaLibre más
  nueva que la que corre actualmente (rechazado por defecto)

Después de un `pg_restore` exitoso, `restore` corre automáticamente `copalibre migrate` y luego abre
una conexión para verificar que la versión de esquema aplicada coincide exactamente con la que esta
instalación espera (el mismo chequeo que usa `GET /ready`) — así una restauración nunca deja el
código y la base desincronizados en silencio. Si la migración falla, `restore` lo reporta con su
código de salida sin afirmar éxito; reintente con `copalibre migrate` y luego `copalibre doctor`.

Un paquete cuyo manifiesto registra una versión de CopaLibre más nueva que la que corre actualmente
se rechaza antes de tocar la base de datos, nombrando ambas versiones — actualice esta instalación
primero, o pase `--allow-newer-backup` si de verdad lo desea.

## upgrade-check

`copalibre upgrade-check --target-version <semver>`

Chequea la compatibilidad de los módulos instalados y las migraciones pendientes antes de
actualizar.

- `--target-version <semver>`: versión de CopaLibre contra la que verificar módulos y migraciones

Termina con código de salida distinto de cero si algún módulo instalado dejaría de ser compatible
con la versión objetivo. Ver [actualización](/help/cli/updating/) para la secuencia completa.

## create-admin

`copalibre create-admin --organization-alias <alias> --organization-name <nombre> --email <email>`

Crea la primera cuenta de administrador de una organización.

## module

`copalibre module <add|list|remove|verify>`

Gestiona los módulos de disciplina y perfil de torneo instalados.

### module add

`copalibre module add <alias>[@rango] [--source <url>] [--allow-unsatisfied-capabilities]`

Instala un módulo por alias, opcionalmente fijado a un rango de versión.

- `--source <url>`: una fuente alternativa habilitada explícitamente, en vez de la curada
- `--allow-unsatisfied-capabilities`: instala aunque las capacidades requeridas declaradas no estén
  aún satisfechas

### module list

`copalibre module list [--outdated]`

Lista los módulos instalados, o solo los que tienen una versión publicada más nueva.

- `--outdated`: muestra solo los módulos con una versión publicada más nueva

### module remove

`copalibre module remove <alias>`

Elimina un módulo instalado que ningún torneo iniciado referencia.

### module verify

`copalibre module verify`

Re-valida cada módulo instalado contra la versión del core en ejecución.

### module scaffold

`copalibre module scaffold <discipline|tournament-profile> <alias> [--author <nombre>] [--licence <licencia>] [--name <nombre>] [--source-url <url>] [--output <dir>]`

Genera un paquete de módulo estructuralmente válido para empezar a autoría — sembrado desde uno de
los documentos ya válidos del catálogo de CopaLibre, no una suposición a ciegas del schema — como un
repositorio Git local etiquetado, listo para editar, validar e instalar/enviar.

- `--author <nombre>`: autor de la atribución (por defecto: Unknown)
- `--licence <licencia>`: identificador SPDX (por defecto: AGPL-3.0-only)
- `--name <nombre>`: nombre de despliegue (por defecto: el alias)
- `--source-url <url>`: URL de origen de la atribución
- `--output <dir>`: dónde escribir el repositorio del módulo (por defecto: `modules/<alias>`)

### module validate-local

`copalibre module validate-local <ruta>`

Valida un paquete de módulo local sin buscarlo ni instalarlo — el mismo chequeo que
`module add`/`module verify` ya aplican.

### module submit

`copalibre module submit <ruta> [--upstream <owner/repo>] [--base <rama>]`

Bifurca (`fork`) `copalibre-modules`, copia el módulo local a una rama nueva, la publica, y abre un
pull request.

- `--upstream <owner/repo>`: repositorio destino (por defecto: `SebaSOFT/copalibre-modules`)
- `--base <rama>`: rama base del pull request (por defecto: `main`)

## mcp

`copalibre mcp`

Arranca un servidor local del Model Context Protocol (MCP) sobre stdio, para que una IA pueda operar
CopaLibre. Ver el [detalle de herramientas MCP](/help/cli/mcp/).
