---
title: 'Primeros pasos: autoalojamiento'
description: Ejecute CopaLibre desde el código fuente en Windows, macOS o Linux, y elija entre proxy inverso o Kubernetes.
capabilities:
  - platform/self-hosted-deployment
roles:
  - super-admin
---

Esta página deja una copia recién clonada funcionando en su equipo o servidor, y luego explica las
dos formas admitidas de exponerla a tráfico real. Referencia de comandos CLI:
[Instalación](/es/help/cli/installation/); detalle de backup/restore y datos persistentes:
`docs/self-hosting.md` en el repositorio.

## 1. Requisitos previos, por plataforma

Cada rol se distribuye como una única imagen Docker multirol, compilada directamente desde este
repositorio — no existe un paso de "build de producción" separado. Necesita Docker, Docker Compose
v2 y Git; nada más se ejecuta en el host.

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

```bash
git clone https://github.com/SebaSOFT/copalibre.git
cd copalibre
./copalibre init      # escribe valores por defecto no secretos en .env, lista los secretos requeridos
```

Edite `.env`: una contraseña fuerte para PostgreSQL, un `COPALIBRE_BOOTSTRAP_TOKEN` opaco, sus
valores JWKS/issuer/audience de OIDC (o el proveedor de identidad nativo por email/contraseña — vea
[Roles y permisos](/es/help/control/roles-permissions/)), el ID de cliente público del navegador, y un
proveedor de email admitido.

```bash
./copalibre doctor    # valida la configuración antes de iniciar cualquier cosa
./copalibre start     # docker compose up --detach --wait — compila las imágenes localmente
./copalibre create-admin --organization-alias mi-liga --organization-name "Mi Liga" \
  --email admin@ejemplo.com
```

`./copalibre start` compila `copalibre:local` y `copalibre-web:local` desde esta copia local por
defecto — esa compilación **es** "ejecutar desde el código fuente". Apunte
`COPALIBRE_IMAGE`/`COPALIBRE_WEB_IMAGE` a una etiqueta publicada si prefiere descargar una versión en
lugar de compilarla.

En este punto la pila está en ejecución pero no es alcanzable desde fuera del host:
`docker-compose.yml` deliberadamente nunca termina TLS ni expone un puerto público propio. Elija una
de las dos topologías abajo para exponerla realmente a usuarios.

## 3. Elegir cómo exponerla

### Opción A — un solo host, proxy inverso en el borde

La topología más simple admitida: un host Docker ejecutando Compose, con Caddy o NGINX al frente
terminando TLS y enrutando a los servicios internos. Esto es para lo que `./copalibre start` está
pensado de fábrica, en cualquiera de las tres plataformas anteriores.

1. Configure `COPALIBRE_APP_HOST`, `COPALIBRE_API_HOST` y `COPALIBRE_EVENTS_HOST` con sus nombres de
   host públicos, y `ACME_EMAIL` para que el proxy pueda solicitar certificados automáticamente.
2. Enrute el tráfico API ordinario a `api:3001`, el tráfico SSE a `events:3002`, las rutas SSR
   públicas a `web-ssr:3005`, y el tráfico web estático de control/público a `web:4321`. Configs de
   ejemplo:
   [`deploy/proxy/Caddyfile`](https://github.com/SebaSOFT/copalibre/blob/main/deploy/proxy/Caddyfile)
   y [`deploy/proxy/nginx.conf`](https://github.com/SebaSOFT/copalibre/blob/main/deploy/proxy/nginx.conf).
   El proxy debe preservar los headers de reenvío, mantener SSE sin buffer, y dejar que los streams
   inactivos sobrevivan a los heartbeats — el ejemplo de Caddy configura `flush_interval -1`
   exactamente por esta razón.
3. Verifíquelo: `./copalibre doctor --check-proxy --proxy-url https://events.ejemplo/events/proxy-check`.

Esto funciona igual en Linux, macOS y Windows (WSL2) — el proxy es solo otro contenedor (o un
proceso en el mismo host) delante de la misma pila Compose.

### Opción B — Kubernetes (de K3s a clústeres empresariales)

Para despliegues multi-nodo, escalados horizontalmente, o con infraestructura gestionada, un chart
Helm (`deploy/helm/copalibre/`) despliega las mismas imágenes, contrato de entorno, health checks y
proceso de migración que la instalación con Compose — instalarlo con los valores por defecto se
comporta idéntico al chart base solo.

```bash
helm install my-copalibre deploy/helm/copalibre/ \
  --set image.tag=<version> --set web.image.tag=<version>
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

PostgreSQL gestionado, almacenamiento de objetos compatible con S3 (AWS S3, MinIO, R2, B2), o una
ruta de VM gestionada (Kamal, `docs/deployment/kamal.md`) son todos configuración, no cambios de
código — `packages/persistence` ya los apunta genéricamente. Valide cualquier cambio de chart
localmente contra un clúster multi-nodo descartable antes de tocar uno real:

```bash
k3d cluster create --config deploy/helm/k3s-dev-cluster.yaml
```

Lista completa de prerrequisitos y la evidencia medida de failover multi-nodo, backup-restore y
seguridad de actualización sobre la que se condiciona esta afirmación:
`docs/deployment/enterprise-kubernetes.md` en el repositorio.

## 4. Próximos pasos

- [Primer torneo](/es/help/getting-started/) — cree y publique una competición una vez que la
  instalación esté funcionando.
- [Operación y trazabilidad](/es/help/operations/) — ejecutar partidos y corregir resultados de forma
  segura.
- [Referencia CLI](/es/help/cli/commands/) — todos los subcomandos de `copalibre`, incluyendo `backup`,
  `restore` y `upgrade-check`.
