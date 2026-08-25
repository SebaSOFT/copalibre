---
title: 'Premiers pas : auto-hébergement'
description: Exécutez CopaLibre depuis les sources sur Windows, macOS ou Linux, puis choisissez une topologie de déploiement à proxy inverse ou Kubernetes.
---

Cette page fait tourner un checkout neuf sur votre propre machine ou serveur, puis explique les deux
façons prises en charge de l'exposer à un trafic réel. Pour la référence des commandes CLI, voir
[Installation](/help/cli/installation/) ; pour les détails de sauvegarde/restauration et de données
persistantes, voir `docs/self-hosting.md` dans le dépôt.

## 1. Prérequis, par plateforme

Chaque rôle est livré comme une seule image Docker multi-rôles construite directement depuis ce
dépôt — il n'y a pas d'étape séparée de « build de production ». Il vous faut Docker, Docker Compose
v2, et Git ; rien d'autre ne tourne sur l'hôte.

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

```bash
git clone https://github.com/SebaSOFT/copalibre.git
cd copalibre
./copalibre init      # écrit les valeurs par défaut non secrètes dans .env, liste les secrets requis
```

Modifiez `.env` : un mot de passe PostgreSQL fort, un `COPALIBRE_BOOTSTRAP_TOKEN` opaque, vos valeurs
OIDC JWKS/issuer/audience (ou le fournisseur d'identité natif email/mot de passe — voir
[Rôles & permissions](/help/control/roles-permissions/)), l'ID client navigateur public, et un
fournisseur d'e-mail pris en charge.

```bash
./copalibre doctor    # valide la configuration avant tout démarrage
./copalibre start     # docker compose up --detach --wait — construit les images localement
./copalibre create-admin --organization-alias my-league --organization-name "My League" \
  --email admin@example.com
```

`./copalibre start` construit `copalibre:local` et `copalibre-web:local` depuis ce checkout par
défaut — c'est cela, « exécuter depuis les sources ». Pointez `COPALIBRE_IMAGE`/`COPALIBRE_WEB_IMAGE`
vers un tag publié à la place si vous préférez récupérer une release plutôt que d'en construire une.

À ce stade, la pile fonctionne mais n'est pas accessible depuis l'extérieur de l'hôte :
`docker-compose.yml` ne termine délibérément jamais le TLS ni n'expose de port public lui-même.
Choisissez l'une des deux topologies ci-dessous pour réellement l'exposer aux utilisateurs.

## 3. Choisissez comment l'exposer

### Option A — hôte unique, proxy inverse en périphérie

La topologie la plus simple prise en charge : un hôte Docker unique exécutant Compose, avec Caddy ou
NGINX devant terminant le TLS et routant vers les services internes. C'est pour cela que
`./copalibre start` est conçu par défaut, sur les trois plateformes ci-dessus.

1. Définissez `COPALIBRE_APP_HOST`, `COPALIBRE_API_HOST` et `COPALIBRE_EVENTS_HOST` avec vos noms
   d'hôte publics, et `ACME_EMAIL` pour que le proxy puisse demander des certificats automatiquement.
2. Routez le trafic API ordinaire vers `api:3001`, le trafic SSE vers `events:3002`, les routes SSR
   publiques vers `web-ssr:3005`, et le trafic web statique control/public vers `web:4321`. Exemples
   de configuration :
   [`deploy/proxy/Caddyfile`](https://github.com/SebaSOFT/copalibre/blob/main/deploy/proxy/Caddyfile)
   et [`deploy/proxy/nginx.conf`](https://github.com/SebaSOFT/copalibre/blob/main/deploy/proxy/nginx.conf).
   Le proxy doit préserver les en-têtes de transfert, garder le SSE non tamponné, et laisser les flux
   inactifs survivre aux heartbeats — l'exemple Caddy définit `flush_interval -1` exactement pour
   cette raison.
3. Vérifiez-le : `./copalibre doctor --check-proxy --proxy-url https://events.example/events/proxy-check`.

Cela fonctionne à l'identique sur Linux, macOS et Windows (WSL2) — le proxy n'est qu'un autre
conteneur (ou un processus sur le même hôte) devant la même pile Compose.

### Option B — Kubernetes (de K3s aux clusters d'entreprise)

Pour les déploiements multi-nœuds, mis à l'échelle horizontalement, ou sur infrastructure gérée, un
chart Helm (`deploy/helm/copalibre/`) déploie les mêmes images, contrat d'environnement, contrôles de
santé et processus de migration que l'installation Compose — l'installer avec les valeurs par défaut
se comporte de façon identique au chart de base seul.

```bash
helm install my-copalibre deploy/helm/copalibre/ \
  --set image.tag=<version> --set web.image.tag=<version>
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

PostgreSQL géré, stockage d'objets compatible S3 (AWS S3, MinIO, R2, B2), ou un chemin de VM géré
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
