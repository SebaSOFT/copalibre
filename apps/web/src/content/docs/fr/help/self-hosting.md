---
title: 'Premiers pas : auto-hébergement'
description: Exécutez CopaLibre depuis les sources sur Windows, macOS ou Linux, puis choisissez une topologie de déploiement à proxy inverse ou Kubernetes.
capabilities:
  - platform/self-hosted-deployment
roles:
  - super-admin
---

Cette page fait tourner un checkout neuf sur votre propre machine ou serveur, puis explique les deux
façons prises en charge de l'exposer à un trafic réel. Pour la référence des commandes CLI, voir
[Installation](/help/cli/installation/) ; pour les détails de sauvegarde/restauration et de données
persistantes, voir `docs/self-hosting.md` dans le dépôt.

## 1. Prérequis, par plateforme

Docker, Docker Compose v2 et Git sont requis. Le wrapper des sources nécessite aussi Node.js 24 et Corepack sur l’hôte. Le binaire autonome ne nécessite pas Node.js ; voir [Installation](/fr/help/cli/installation/).

**Linux** — installez Docker Engine et le plugin Compose depuis le gestionnaire de paquets de votre
distribution ou le [dépôt officiel de Docker](https://docs.docker.com/engine/install/) (`docker-ce`,
`docker-compose-plugin`). Ajoutez votre utilisateur au groupe `docker` pour que `./copalibre` n'ait
pas besoin de `sudo`.

**macOS** — installez [Docker Desktop](https://docs.docker.com/desktop/install/mac-install/) (Apple
Silicon ou Intel). Colima avec les CLI autonomes `docker`/`docker-compose` fonctionne aussi si vous
préférez ne pas exécuter Docker Desktop.

**Windows** — installez [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/)
avec le **backend WSL2** activé, et exécutez chaque commande ci-dessous depuis une distribution WSL2
(Ubuntu est la mieux testée), pas depuis PowerShell ou `cmd.exe` directement. `./copalibre` est un
script `sh` POSIX ; WSL2 lui donne un vrai shell et permet à l'intégration WSL de Docker Desktop
d'exposer le démon sans configuration réseau supplémentaire. Git Bash peut exécuter
`sh copalibre <command>` en dépannage, mais les chemins de montage de volumes et les permissions de
fichiers sont plus prévisibles sous WSL2 — préférez-le pour tout ce qui dépasse un test local rapide.

## 2. Exécutez depuis les sources

Construisez les deux images depuis la racine du dépôt, puis initialisez un répertoire vide :

```bash
git clone https://github.com/SebaSOFT/copalibre.git
cd copalibre
docker build --target runtime -t copalibre:local .
docker build --target web -t copalibre-web:local .
mkdir my-league && cd my-league
../copalibre init
```

Avant le démarrage, modifiez `.env` : utilisez `COPALIBRE_IMAGE=copalibre:local` et `COPALIBRE_WEB_IMAGE=copalibre-web:local` pour ces images. Sinon, `init` sélectionne les images publiées correspondant au CLI. Remplacez les mots de passe de développement et le jeton de bootstrap ; configurez identité, messagerie et URL publiques. Définissez `GARAGE_RPC_SECRET` avec `openssl rand -hex 32` ; Compose interpole cette valeur obligatoire même lorsque le stockage optionnel est désactivé.

```bash
../copalibre doctor
../copalibre start
../copalibre status
../copalibre restart
../copalibre stop
../copalibre create-admin --organization-alias my-league --organization-name "My League" --email admin@example.com
```

Utilisez copalibre status pour vérifier les conteneurs et la passerelle. copalibre restart vérifie PostgreSQL et doctor avant de relancer les services. copalibre stop conserve les volumes ; --down supprime les conteneurs et réseaux. En mode Kubernetes, start/stop/restart affichent les instructions Helm ou kubectl.

La passerelle expose HTTP sur `http://localhost:8080` (`COPALIBRE_PORT`). Compose expose aussi les ports des services ; limitez leur accès au niveau de l’hôte et du réseau. TLS se termine au proxy de bordure.

## 3. Choisissez comment l'exposer

### Option A — hôte unique, proxy inverse en périphérie

Dirigez le domaine de l’application vers `gateway:80` dans le réseau Compose, ou `127.0.0.1:8080` pour un proxy sur l’hôte. La passerelle distribue API, authentification, SSE et web sur la même origine ; le conteneur web transmet les pages dynamiques à `web-ssr`. Utilisez `deploy/proxy/Caddyfile` ou `deploy/proxy/nginx.conf`, configurez TLS et les URL publiques, et désactivez la mise en tampon SSE. Les domaines API/events séparés sont facultatifs avec une origine unique.

```bash
../copalibre doctor --check-proxy --proxy-url https://app.example/events/proxy-check
```

### Option B — Kubernetes (de K3s aux clusters d'entreprise)

Pour les déploiements multi-nœuds, mis à l'échelle horizontalement, ou sur infrastructure gérée, un
chart Helm (`deploy/helm/copalibre/`) déploie les mêmes images, contrat d'environnement, contrôles de
santé et processus de migration que l'installation Compose — l'installer avec les valeurs par défaut
se comporte de façon identique au chart de base seul.

Exécutez Helm depuis la racine du dépôt après avoir configuré `my-values.yaml` : base de données, identité, messagerie et URL publiques. Utilisez une version déjà publiée pour les deux images ; 1.2.5 sera disponible après publication.

```bash
cd ..
helm show values deploy/helm/copalibre/ > my-values.yaml
```

```bash
helm install my-copalibre deploy/helm/copalibre/ -f my-values.yaml \
  --set image.repository=ghcr.io/sebasoft/copalibre --set-string image.tag=1.2.5 \
  --set web.image.repository=ghcr.io/sebasoft/copalibre-web --set-string web.image.tag=1.2.5
```

Superposez ces groupes `values.yaml` additifs, désactivés par défaut, selon vos besoins — aucun ne
nécessite de fork du template :

- **`autoscaling`** — HPA par rôle (`api` sur le taux de requêtes HTTP, `events` sur les connexions
  SSE actives, `worker` sur la profondeur/l'âge de la file outbox) — nécessite un adaptateur de
  métriques personnalisées (Prometheus Adapter, KEDA) ; aucun de ces trois signaux n'est une métrique
  Kubernetes native.
- **`podDisruptionBudget`** et **`affinity.antiAffinity`** — protection contre les disruptions et
  répartition souple entre nœuds, indépendamment de l'autoscaling.
- **`networkPolicy`** — refus par défaut par rôle, avec `publicRoles` (par défaut `api`, `events`,
  plus `web` toujours) ouvert au trafic extérieur.
- **`ingress`** — nécessite un contrôleur d'ingress et, pour le TLS automatique, cert-manager.
- **`externalSecrets`** — nécessite l'External Secrets Operator ; source `DATABASE_URL`,
  les identifiants `COPALIBRE_OBJECT_STORAGE_*`, etc. depuis votre véritable coffre-fort de secrets
  plutôt qu'un simple manifeste `Secret`.

PostgreSQL géré, stockage d'objets compatible S3 (AWS S3, Garage, R2, B2), ou un chemin de VM géré
(Kamal, `docs/deployment/kamal.md`) sont tous de la configuration, pas des changements de code —
`packages/persistence` les cible déjà génériquement. Validez tout changement de chart localement sur
un cluster multi-nœuds jetable avant de toucher un cluster réel :

```bash
k3d cluster create --config deploy/helm/k3s-dev-cluster.yaml
```

Liste complète des prérequis et les preuves mesurées de basculement multi-nœuds, de
sauvegarde-restauration et de sécurité de mise à niveau sur lesquelles repose cette affirmation :
`docs/deployment/enterprise-kubernetes.md` dans le dépôt.

## 4. Étapes suivantes

- [Votre premier tournoi](/help/getting-started/) — créez et publiez une compétition une fois
  l'installation en place.
- [Opération et traçabilité](/help/operations/) — gérer les matchs et corriger les résultats en
  toute sécurité.
- [Référence CLI](/help/cli/commands/) — chaque sous-commande `copalibre`, y compris `backup`,
  `restore`, et `upgrade-check`.
