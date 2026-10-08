---
title: 'Primeros pasos: autoalojamiento'
description: Ejecute CopaLibre desde el código fuente en Windows, macOS o Linux, y elija entre proxy inverso o Kubernetes.
capabilities:
  - platform/self-hosted-deployment
  - platform/email-notifications
roles:
  - super-admin
---

Esta página deja una copia recién clonada funcionando en su equipo o servidor, y luego explica las
dos formas admitidas de exponerla a tráfico real. Referencia de comandos CLI:
[Instalación](/es/help/cli/installation/); detalle de backup/restore y datos persistentes:
`docs/self-hosting.md` en el repositorio.

## 1. Requisitos previos, por plataforma

Se necesitan Docker, Docker Compose v2 y Git. El wrapper del código fuente también requiere Node.js 24 y Corepack en el host. El binario independiente no necesita Node.js; vea [Instalación](/es/help/cli/installation/).

**Linux** — instale Docker Engine y el plugin de Compose desde el gestor de paquetes de su
distribución o desde el [repositorio propio de Docker](https://docs.docker.com/engine/install/)
(`docker-ce`, `docker-compose-plugin`). Agregue su usuario al grupo `docker` para que `./copalibre`
no necesite `sudo`.

**macOS** — instale [Docker Desktop](https://docs.docker.com/desktop/install/mac-install/) (Apple
Silicon o Intel). Colima junto con los CLI standalone `docker`/`docker-compose` también funciona si
prefiere no ejecutar Docker Desktop.

**Windows** — instale [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/) con
el **backend WSL2** habilitado, y ejecute cada comando siguiente desde una distro WSL2 (Ubuntu es la
más probada), no desde PowerShell ni `cmd.exe` directamente. `./copalibre` es un script `sh` POSIX;
WSL2 le da un shell real y permite que la integración WSL de Docker Desktop exponga el daemon sin
configuración de red adicional. Git Bash puede ejecutar `sh copalibre <comando>` como alternativa,
pero las rutas de montaje de volúmenes y los permisos de archivo son más predecibles bajo WSL2 —
prefiéralo para cualquier cosa más allá de una prueba local rápida.

## 2. Ejecutarlo desde el código fuente

Compile ambas imágenes desde la raíz del repositorio e inicialice un directorio de instalación vacío:

```bash
git clone https://github.com/SebaSOFT/copalibre.git
cd copalibre
docker build --target runtime -t copalibre:local .
docker build --target web -t copalibre-web:local .
mkdir my-league && cd my-league
../copalibre init
```

Antes de iniciar, edite `.env`: configure `COPALIBRE_IMAGE=copalibre:local` y `COPALIBRE_WEB_IMAGE=copalibre-web:local` para usar estas compilaciones. De lo contrario, `init` selecciona imágenes publicadas de la versión del CLI. Reemplace las contraseñas de desarrollo y el token de bootstrap, configure identidad, correo y URL públicas. Configure `GARAGE_RPC_SECRET` con `openssl rand -hex 32`; Compose interpola este valor obligatorio incluso si el almacenamiento opcional está desactivado.

```bash
../copalibre doctor
../copalibre start
../copalibre status
../copalibre restart
../copalibre stop
../copalibre create-admin --organization-alias my-league --organization-name "My League" --email admin@example.com
```

Usa copalibre status para revisar contenedores y gateway. copalibre restart verifica PostgreSQL y doctor antes de volver a iniciar los servicios. copalibre stop conserva los volúmenes; --down elimina contenedores y redes. En Kubernetes, start/stop/restart muestran instrucciones de Helm o kubectl.

El gateway publica HTTP en `http://localhost:8080` (`COPALIBRE_PORT`). Compose también publica puertos de servicios; limite su exposición en el host y la red. TLS se configura en el proxy de borde.

## 3. Elegir cómo exponerla

### Opción A — un solo host, proxy inverso en el borde

Enrute el host de la aplicación a `gateway:80` dentro de la red Compose, o a `127.0.0.1:8080` si el proxy corre en el host. El gateway distribuye API, autenticación, SSE y web en el mismo origen; el contenedor web reenvía las páginas dinámicas a `web-ssr`. Use `deploy/proxy/Caddyfile` o `deploy/proxy/nginx.conf`, configure TLS y URL públicas, y mantenga SSE sin buffer. Los hosts API/events separados son opcionales cuando se usa un solo origen.

```bash
../copalibre doctor --check-proxy --proxy-url https://app.example/events/proxy-check
```

### Opción B — Kubernetes (de K3s a clústeres empresariales)

Para despliegues multi-nodo, escalados horizontalmente, o con infraestructura gestionada, un chart
Helm (`deploy/helm/copalibre/`) despliega las mismas imágenes, contrato de entorno, health checks y
proceso de migración que la instalación con Compose — instalarlo con los valores por defecto se
comporta idéntico al chart base solo.

Ejecute Helm desde la raíz del repositorio después de crear y configurar `my-values.yaml` con base de datos, identidad, correo y URL públicas. Use una versión ya publicada para ambas imágenes; 1.2.6 estará disponible después de su publicación.

```bash
cd ..
helm show values deploy/helm/copalibre/ > my-values.yaml
```

```bash
helm install my-copalibre deploy/helm/copalibre/ -f my-values.yaml \
  --set image.repository=ghcr.io/sebasoft/copalibre --set-string image.tag=1.2.6 \
  --set web.image.repository=ghcr.io/sebasoft/copalibre-web --set-string web.image.tag=1.2.6
```

Agregue estos grupos aditivos de `values.yaml`, desactivados por defecto, según se necesite —
ninguno requiere un fork de los templates:

- **`autoscaling`** — HPA por rol (`api` según tasa de requests HTTP, `events` según conexiones SSE
  activas, `worker` según profundidad/antigüedad de la cola outbox) — necesita un adaptador de
  métricas personalizadas (Prometheus Adapter, KEDA); ninguna de estas tres señales es una métrica
  nativa de Kubernetes.
- **`podDisruptionBudget`** y **`affinity.antiAffinity`** — protección de disrupción y distribución
  entre nodos, independientes del autoescalado.
- **`networkPolicy`** — denegación por defecto por rol, con `publicRoles` (por defecto `api`,
  `events`, más `web` siempre) abiertos a tráfico externo.
- **`ingress`** — necesita un ingress controller y, para TLS automático, cert-manager.
- **`externalSecrets`** — necesita External Secrets Operator; obtiene credenciales de
  `DATABASE_URL`, `COPALIBRE_OBJECT_STORAGE_*`, etc. desde su almacén de secretos real en lugar de
  un manifiesto `Secret` plano.

PostgreSQL gestionado, almacenamiento de objetos compatible con S3 (AWS S3, Garage, R2, B2), o una
ruta de VM gestionada (Kamal, `docs/deployment/kamal.md`) son todos configuración, no cambios de
código — `packages/persistence` ya los apunta genéricamente. Valide cualquier cambio de chart
localmente contra un clúster multi-nodo descartable antes de tocar uno real:

```bash
k3d cluster create --config deploy/helm/k3s-dev-cluster.yaml
```

Lista completa de prerrequisitos y la evidencia medida de failover multi-nodo, backup-restore y
seguridad de actualización sobre la que se condiciona esta afirmación:
`docs/deployment/enterprise-kubernetes.md` en el repositorio.

## 4. Correo de notificaciones

La actividad de torneos y de la organización se avisa por correo mediante el proveedor que configuró para las invitaciones (`COPALIBRE_EMAIL_PROVIDER`); no hace falta ninguna otra configuración. En el entorno de desarrollo los correos llegan a Mailpit.

- Un torneo nuevo y un club nuevo se avisan a los administradores de la organización.
- Una inscripción nueva, y un club que envía su plantel, se avisan a los administradores de la organización y a los administradores de ese torneo. Quien provocó el evento no recibe el correo.
- Los correos usan el idioma principal de la organización, llevan su emblema y nombre en el encabezado, y van firmados por Copa Libre con un enlace a [copalibre.app](https://copalibre.app).
- Las importaciones CSV y `copalibre dev demo` no envían correo.
- El mismo correo nunca se envía dos veces al mismo destinatario. Si un proveedor agota el tiempo antes de confirmar, ese correo no se reintenta, así que puede perderse en lugar de duplicarse.
- Quien opera puede ver cuántos correos pudieron perderse: el worker cuenta cada intento de envío por resultado (enviado, ya enviado, rechazado, desconocido) en la respuesta de `/jobs/metrics`, bajo `emailDelivery`, y registra cada resultado desconocido sin la dirección del destinatario. Un `unknown` distinto de cero merece una alerta; los contadores vuelven a cero cuando el worker se reinicia.

## 5. Próximos pasos

- [Primer torneo](/es/help/getting-started/) — cree y publique una competición una vez que la
  instalación esté funcionando.
- [Operación y trazabilidad](/es/help/operations/) — ejecutar partidos y corregir resultados de forma
  segura.
- [Referencia CLI](/es/help/cli/commands/) — todos los subcomandos de `copalibre`, incluyendo `backup`,
  `restore` y `upgrade-check`.
