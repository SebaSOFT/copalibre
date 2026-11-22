---
title: Actualización
description: Camino no-destructivo para actualizar el framework CopaLibre y sus módulos instalados.
capabilities: []
roles:
  - super-admin
---

## Actualizar el CLI copalibre en sí

`copalibre --version` imprime la versión del binario instalado. Volver a ejecutar el script de
instalación descarga la última versión publicada y reemplaza el binario en el lugar — es
idempotente: primero revisa la versión instalada y omite la descarga si ya coincide:

```bash
curl -fsSL https://github.com/SebaSOFT/copalibre/releases/latest/download/install.sh | bash
```

Esto solo reemplaza el binario `copalibre`. No afecta a una instalación en ejecución — ver abajo
para actualizar el framework y sus módulos.

## Actualizar el framework

Ejecute `copalibre upgrade` en el directorio de la instalación, con el CLI de la versión a la que
pasa. Primero vea qué va a hacer; no cambia nada:

```bash
copalibre upgrade --check
```

### Desde dónde parte

| Su instalación la creó                       | Haga esto                                                                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1.2.5 o 1.2.6                                | `copalibre upgrade --self`, después `copalibre upgrade --check` y `copalibre upgrade`                                  |
| 1.2.1 o anterior (su CLI no tiene `upgrade`) | Instale el CLI nuevo con el script de instalación de arriba, después `copalibre upgrade --check` y `copalibre upgrade` |
| Un CLI 1.2.x ya ejecutó `copalibre upgrade`  | Instale el CLI nuevo y ejecute `copalibre upgrade` otra vez                                                            |

No deje que un CLI 1.2.x ejecute `copalibre upgrade` por su cuenta. Escribe la versión nueva en
`.env`, `docker-compose.yml` y `.copalibre/installation.json`, informa éxito y deja todos los
contenedores con las imágenes viejas; el próximo reinicio arranca las imágenes nuevas sobre el
archivo Compose viejo, y eso no funciona. El CLI nuevo reconoce una instalación que quedó así, diga
lo que diga su marcador, y termina el trabajo.

### Qué hace el upgrade

1. Descarga las imágenes nuevas mientras la instalación sigue funcionando, así nada se detiene si
   falta una.
2. Detiene el stack, para no perder ninguna escritura, y respalda la base de datos en
   `backups/pre-upgrade-<desde>-to-<hacia>-<fecha>.tar.gz`.
3. Reemplaza `docker-compose.yml` y `deploy/gateway/Caddyfile` por los de la versión nueva, cuando
   siguen como los distribuyó una versión, y conserva los anteriores como
   `docker-compose.yml.<desde>.bak` y `deploy/gateway/Caddyfile.<desde>.bak`. Actualiza `.env`
   (ajustes nuevos, etiquetas de imagen nuevas, la dirección del conjunto de claves que pasó a
   `/api`) y conserva `.env.<desde>.bak`; los valores que usted configuró se mantienen.
4. Mueve la base de datos de PostgreSQL 17 a 18: restaura el respaldo en un volumen nuevo
   (`postgresql-data`) y compara la cantidad de filas de cada tabla antes de seguir. El volumen de 17
   no se toca.
5. Arranca la versión nueva y ejecuta `copalibre doctor`. En una terminal, doctor ofrece configurar lo que
   le falta a la instalación, como el envío de correo; ver [doctor](/es/help/cli/commands/#doctor).
6. Cuando doctor pasa, comprueba que el respaldo se puede leer y luego elimina el volumen de
   PostgreSQL 17 (`postgres-data`) y la imagen `postgres:17`. Con `--keep-old-volume` se conservan; el
   upgrade imprime los dos comandos para eliminarlos después.

El stack está detenido desde el paso 2 hasta que el paso 5 termina bien; planifique la ventana según
el tamaño de su base de datos. El movimiento necesita espacio libre en el disco de Docker del doble del tamaño de la base:
sin él, el upgrade no empieza. Copie el paquete de respaldo fuera del servidor cuando termine.

### Si modificó docker-compose.yml

Un archivo Compose que no coincide con ninguna versión (un servicio que agregó, un valor que cambió)
queda como está. El upgrade escribe el archivo de la versión nueva como `docker-compose.yml.new`, lo
avisa y se detiene antes de cambiar nada más. Incorpore sus cambios a ese archivo, reemplace
`docker-compose.yml` por el resultado y ejecute `copalibre upgrade` otra vez. Una configuración del
gateway que usted modificó se conserva, y el upgrade lo dice.

### Instalaciones de 1.0

La 1.0 no tenía gateway: el proxy de borde llegaba directamente a `web`, `api` y `events`. Desde la
1.1, el servicio `gateway` es la única entrada, en `COPALIBRE_PORT` (8080 si no lo configura). Después
del upgrade, apunte su proxy al gateway y configure `COPALIBRE_APP_URL` con la dirección que usan los
navegadores; ejecute `copalibre doctor` para confirmarlo.

### Volver atrás

Si falla cualquier paso anterior a doctor, el upgrade vuelve a poner los archivos anteriores, arranca
la versión anterior sobre su volumen de PostgreSQL 17 intacto e informa por qué se detuvo. Si falla
doctor, la versión nueva sigue funcionando y el upgrade imprime estos pasos sin eliminar nada.

Mientras el volumen de PostgreSQL 17 exista (falló doctor, o usó `--keep-old-volume`):

```bash
docker compose down
cp docker-compose.yml.<desde>.bak docker-compose.yml
cp .env.<desde>.bak .env
cp deploy/gateway/Caddyfile.<desde>.bak deploy/gateway/Caddyfile   # si el upgrade lo reemplazó
docker compose up --detach --wait
```

El volumen de PostgreSQL 18 (`<proyecto>_postgresql-data`) queda sin uso; elimínelo con
`docker volume rm` antes de volver a intentar el upgrade si quiere empezar de cero.

Después de que el upgrade eliminó PostgreSQL 17, el camino de vuelta es el paquete de respaldo.
Instale el CLI de la versión anterior en un directorio nuevo y vacío, ejecute `copalibre init` ahí,
copie el paquete en su `backups/` y restáurelo:

```bash
copalibre restore --file backups/pre-upgrade-<desde>-to-<hacia>-<fecha>.tar.gz --confirm
```

Se pierden las escrituras posteriores al upgrade. Volver a imágenes anteriores sobre la base ya
migrada nunca es una forma segura de volver atrás.

### Procedimiento manual con Compose (entre versiones 2.x)

Desde una instalación 1.x use `copalibre upgrade`: su base de datos tiene que pasar a PostgreSQL 18,
y estos pasos no lo hacen.

Conserve el CLI que coincide con `.copalibre/installation.json`. Reemplazar el binario no actualiza el marcador, los archivos Compose ni las imágenes. Antes de actualizar, respalde PostgreSQL, objetos, configuración y claves de firma; conserve las versiones de imagen anteriores.

```bash
copalibre backup --file backups/pre-upgrade.tar.gz
```

En el directorio de instalación existente, revise los cambios de Compose/configuración de la versión objetivo y cambie ambas referencias de imagen en `.env`. Conserve el proyecto Compose y los volúmenes. Descargue y verifique la imagen objetivo sin iniciar dependencias ni aplicar migraciones:

```dotenv
COPALIBRE_IMAGE=ghcr.io/sebasoft/copalibre:1.2.6
COPALIBRE_WEB_IMAGE=ghcr.io/sebasoft/copalibre-web:1.2.6
```

```bash
docker compose pull
docker compose run --rm --no-deps upgrade-check --target-version 1.2.6
```

Tras una verificación satisfactoria, programe una interrupción, detenga los procesos de aplicación y realice un respaldo final; luego migre y reinicie. No reinicie si falla la migración:

```bash
docker compose stop gateway web web-ssr api events worker scheduler
copalibre backup --file backups/pre-upgrade.tar.gz
docker compose run --rm migrate && docker compose up --detach --wait
docker compose run --rm doctor
```

No elimine ni reescriba el marcador para eludir la verificación de versión. Para operaciones posteriores de esquema entre versiones, use los servicios Compose explícitos anteriores; el CLI nuevo no puede ejecutar `migrate` ni `upgrade-check` con el marcador antiguo. Un directorio nuevo creado con `init` es otra instalación, no una actualización en el lugar.

Después de migrar la base de datos, volver a imágenes anteriores no es una reversión segura. Mantenga detenidos los procesos que escriben y restaure los respaldos previos de PostgreSQL, objetos y configuración en una instalación aislada de la versión anterior. Verifique la recuperación antes de cambiar el tráfico; se pierden las escrituras posteriores al respaldo.

## Actualización según el despliegue

Con Compose detrás de NGINX o Caddy, conserve el proxy y los certificados, use modo de mantenimiento durante la migración y valide/recargue solo la configuración modificada. En Kubernetes, use el chart objetivo con valores revisados y ambas imágenes, ejecute primero un Job de compatibilidad y verifique los Jobs de migración/doctor y el ingress antes de reabrir el tráfico. Helm rollback no revierte la base de datos. Comandos detallados:

- [Caddy](https://github.com/SebaSOFT/copalibre/blob/main/docs/deployment/reverse-proxy/caddy.md#upgrading-copalibre-behind-caddy)
- [NGINX](https://github.com/SebaSOFT/copalibre/blob/main/docs/deployment/reverse-proxy/nginx.md#upgrading-copalibre-behind-nginx)
- [Kubernetes / Helm](https://github.com/SebaSOFT/copalibre/blob/main/docs/deployment/enterprise-kubernetes.md#upgrading-an-existing-helm-release-safely)

## Actualizar módulos

Cada disciplina o perfil de torneo instalado es un módulo versionado independientemente del
framework.

```bash
copalibre module list --outdated
```

Lista solo los módulos instalados que tienen una versión publicada más nueva que la instalada.

```bash
copalibre module add <alias>@<rango>
```

Instala una versión específica o un rango (por ejemplo `@^2.0.0`) de un módulo ya instalado —
reinstalar con una versión distinta es la forma de actualizar un módulo. Un torneo ya iniciado sigue
referenciando la versión con la que se creó; actualizar un módulo no cambia retroactivamente un
torneo en curso.

Ver la [referencia de comandos](/es/help/cli/commands/) para el resto de las opciones de `module`.
