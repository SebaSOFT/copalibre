---
title: Actualización
description: Cómo actualizar el framework CopaLibre y sus módulos instalados.
---

## Actualizar el framework

Hoy, actualizar CopaLibre significa: obtener el checkout o la imagen de la nueva versión, correr
`copalibre migrate` para aplicar migraciones pendientes, y `copalibre doctor` para confirmar que la
configuración sigue siendo válida antes de reiniciar los procesos. `copalibre upgrade-check` existe
como punto de entrada para chequeos de compatibilidad de versión, pero hoy no tiene ninguno
registrado — reporta explícitamente que no hay chequeos configurados, en vez de fallar en silencio.
Un camino de actualización no-destructivo más completo, con migración cuidadosa de datos, es un
objetivo en curso.

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

Ver la [referencia de comandos](/help/cli/commands/) para el resto de las opciones de `module`.
