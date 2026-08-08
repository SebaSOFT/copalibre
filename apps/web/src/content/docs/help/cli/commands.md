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

`copalibre backup --file <ruta> [--dry-run]`

Crea un respaldo de PostgreSQL bajo `backups/`.

- `--file <ruta>`: archivo destino, dentro del directorio `backups/`
- `--dry-run`: imprime el plan de respaldo sin ejecutarlo

## restore

`copalibre restore --file <ruta> (--confirm | --dry-run)`

Restaura un respaldo de PostgreSQL en una instalación limpia.

- `--file <ruta>`: archivo de respaldo a restaurar, dentro de `backups/`
- `--confirm`: requerido para ejecutar la restauración de verdad
- `--dry-run`: imprime el plan de restauración sin ejecutarlo

## upgrade-check

`copalibre upgrade-check`

Reporta los chequeos de compatibilidad de versión registrados para la instalación actual.

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
