---
title: Actualización
description: Camino no-destructivo para actualizar el framework CopaLibre y sus módulos instalados.
---

## Actualizar el CLI copalibre en sí

`copalibre --version` imprime la versión del binario instalado. Volver a ejecutar el script de
instalación descarga la última versión publicada y reemplaza el binario en el lugar — es
idempotente: primero revisa la versión instalada y omite la descarga si ya coincide:

```bash
curl -fsSL https://www.copalibre.app/install.sh | bash
```

Esto solo reemplaza el binario `copalibre`. No afecta a una instalación en ejecución — ver abajo
para actualizar el framework y sus módulos.

## Actualizar el framework

Secuencia recomendada, no-destructiva:

1. **Respalde** antes de tocar nada: `./copalibre backup --file backups/pre-upgrade.dump`.
2. **Actualice** el checkout o la referencia de imagen a la nueva versión (no reinicie los
   servicios todavía). Si esta instalación se creó con `copalibre init` (sin checkout, ver la
   [referencia de comandos](/es/help/cli/commands/)), su directorio queda fijado a la versión de CLI
   con la que se creó — `migrate`/`upgrade-check` se niegan con un mensaje claro ante una versión
   distinta, así que actualice ejecutando el CLI de la nueva versión contra el mismo directorio, en
   vez de mezclar versiones de CLI.
3. **Verifique compatibilidad** contra la nueva versión, sin reiniciar nada:
   ```bash
   ./copalibre upgrade-check --target-version <version-nueva>
   ```
   Reporta si algún módulo instalado dejaría de ser compatible con esa versión (mismo chequeo que
   `module verify` usa contra la versión en ejecución, pero contra la versión objetivo), y lista las
   migraciones de base de datos pendientes — sin aplicar ninguna. Termina con código de salida
   distinto de cero si algún módulo quedaría incompatible; corríjalo antes de continuar.
4. **Reinicie** con la nueva versión (`./copalibre start` o `docker compose up --detach --wait`). Las
   migraciones pendientes se aplican automáticamente y en orden antes de que cualquier rol de proceso
   empiece a servir tráfico — no es un paso manual separado.

## Actualizar módulos

Cada disciplina o perfil de torneo instalado es un módulo versionado independientemente del
framework.

```bash
./copalibre module list --outdated
```

Lista solo los módulos instalados que tienen una versión publicada más nueva que la instalada.

```bash
./copalibre module add <alias>@<rango>
```

Instala una versión específica o un rango (por ejemplo `@^2.0.0`) de un módulo ya instalado —
reinstalar con una versión distinta es la forma de actualizar un módulo. Un torneo ya iniciado sigue
referenciando la versión con la que se creó; actualizar un módulo no cambia retroactivamente un
torneo en curso.

Ver la [referencia de comandos](/es/help/cli/commands/) para el resto de las opciones de `module`.
