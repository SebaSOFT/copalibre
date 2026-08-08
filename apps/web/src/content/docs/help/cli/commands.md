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

`copalibre restore --file <ruta> (--confirm | --dry-run)`

Extrae un paquete de respaldo y restaura su volcado de PostgreSQL en una instalación limpia.

- `--file <ruta>`: paquete a restaurar, dentro de `backups/`
- `--confirm`: requerido para ejecutar la restauración de verdad
- `--dry-run`: imprime el plan de restauración sin ejecutarlo

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
