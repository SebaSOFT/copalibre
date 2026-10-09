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
