---
title: Referencia de comandos
description: Cada comando del CLI copalibre, su uso y sus flags.
capabilities: []
roles:
  - super-admin
  - admin
---

Cada comando responde `--help`/`-h` con este mismo texto de uso, generado desde una única fuente
en el propio CLI — esta página no puede describir un comando distinto de lo que el CLI realmente
hace. `copalibre --version` imprime solo la versión instalada, para scripts.

## init

`copalibre init [--module-dev]` o `copalibre init --kubernetes [--namespace <ns>] [--release
<nombre>] [--context <ctx>]`

Escribe una instalación completa en el directorio actual. No requiere un checkout del código
fuente: ejecutalo en cualquier directorio vacío, y cada comando posterior detecta automáticamente
ese directorio a partir del marcador (`.copalibre/installation.json`) que escribe, de la misma
forma en que `.git` marca un checkout de repositorio. Se niega a ejecutarse de nuevo en un
directorio que ya contiene una instalación. Un directorio queda fijado a la versión de CopaLibre
con la que `init` lo creó — ejecutar varias versiones en paralelo implica ejecutar la versión de
CLI correspondiente por directorio (ver [actualización](/es/help/cli/updating/)).

Sin `--kubernetes`, escribe `docker-compose.yml` y `.env` con valores por defecto no secretos, y
lista los secretos requeridos para completar en `.env` después.

- `--module-dev`: también escribe `docker-compose.module-dev.yml` y un directorio `modules-dev/`,
  montado en `api`/`worker` con `COPALIBRE_MODULE_SOURCE_ALLOWLIST` preconfigurado — se combina con
  `module scaffold --output modules-dev/<alias>` y `module add <alias> --source
file:///var/lib/copalibre/modules-dev/<alias>` para desarrollar un módulo contra una instancia
  autoalojada en ejecución, sin checkout del código fuente.

Con `--kubernetes`, escribe un scaffold de `values.yaml` de Helm en su lugar — sin archivo de
compose, sin `.env`; el propio mecanismo de Secret/ConfigMap de Kubernetes sigue siendo autoritativo
para la configuración. Flujo completo, incluyendo el bootstrap del primer administrador como un Job
de Helm de un solo uso: `docs/deployment/enterprise-kubernetes.md` en el repositorio.

- `--kubernetes`: scaffolds una instalación de Helm en lugar de una de Compose
- `--namespace <ns>`: namespace de Kubernetes a registrar (por defecto: `default`)
- `--release <nombre>`: nombre del release de Helm a registrar (por defecto: `copalibre`)
- `--context <ctx>`: kube-context a registrar (por defecto: ninguno — pasarlo explícitamente cada vez)

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
con la versión objetivo. Ver [actualización](/es/help/cli/updating/) para la secuencia completa.

## create-admin

`copalibre create-admin --organization-alias <alias> --organization-name <nombre> --email <email>`

Crea la primera cuenta de administrador de una organización.

## login

`copalibre login [--api-url <url>] [--token <token>]`

Guarda un token de acceso personal para que `statistics-rebuild` y `module add/list/remove/verify`
puedan correr contra una instalación remota mediante una conexión HTTP autenticada — el camino para
administrar una instalación ya en ejecución, incluyendo instalar o actualizar el CLI después de que
Docker ya está corriendo, desde una máquina que nunca necesita credenciales de base de datos. Genere
el token desde la pantalla de preferencias del panel de control mientras ya está logueado, y péguelo
aquí. Valida el token con una llamada autenticada antes de guardarlo; se niega y no guarda nada si
el token es inválido.

- `--api-url <url>`: instalación destino (por defecto: `COPALIBRE_API_URL`, que `copalibre init` ya
  escribe en `.env`)
- `--token <token>`: el token en sí (por defecto: se lee de stdin si viene por pipe, o un prompt
  interactivo que enmascara cada tecla)

Guarda la credencial en `.copalibre/credentials.json` (`0600`) del directorio actual — ejecute
`login` desde dentro del directorio de instalación que creó `copalibre init`. Volver a ejecutar
`login` en el mismo directorio reemplaza el token guardado, a diferencia del marcador de `init`.

## statistics-rebuild

`copalibre statistics-rebuild --organization <alias> [--tournament <alias>]`

Recalcula cada total estadístico plegado (`statistic_totals`) a partir de los hechos de origen —
eventos registrados de partidos finalizados, planteles y ajustes manuales — para toda la
organización por defecto, o acotado a un torneo.

- `--organization <alias>`: organización para la que recalcular las estadísticas
- `--tournament <alias>`: acota el recálculo a un torneo dentro de la organización

Idempotente: usa el mismo `refold` y la misma ruta de escritura de borrar-e-insertar que el disparo
por eventos, así que ejecutarlo dos veces seguidas produce filas de `statistic_totals` idénticas
byte a byte (salvo `updated_at`/la versión interna de proyección). Útil para completar el historial
registrado antes de que existiera el motor de plegado, o para verificar los totales contra los
hechos en cualquier momento. Requiere autoridad de administrador de la organización una vez logueado
mediante [`login`](#login).

## module

`copalibre module <add|list|remove|verify>`

Gestiona los módulos de disciplina y perfil de torneo instalados. `add`/`list`/`remove`/`verify`
requieren autoridad de super-admin de la instalación una vez logueado mediante [`login`](#login).

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
CopaLibre. Ver el [detalle de herramientas MCP](/es/help/cli/mcp/).
