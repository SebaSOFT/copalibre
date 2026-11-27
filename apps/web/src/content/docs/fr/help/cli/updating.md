---
title: Mise à jour
description: Le chemin non destructif pour mettre à jour le framework CopaLibre et ses modules installés.
capabilities: []
roles:
  - super-admin
---

## Mettre à jour le CLI copalibre lui-même

`copalibre --version` affiche la version du binaire installé. Réexécuter le script d'installation
récupère la dernière release publiée et remplace le binaire sur place — c'est idempotent : il
vérifie d'abord la version installée et saute le téléchargement si elle correspond déjà :

```bash
curl -fsSL https://github.com/SebaSOFT/copalibre/releases/latest/download/install.sh | bash
```

Cela ne remplace que le binaire `copalibre`. Cela n'a aucun effet sur une installation en cours
d'exécution — voir ci-dessous pour mettre à jour le framework et ses modules.

## Mettre à jour le framework

Exécutez `copalibre upgrade` dans le répertoire de l'installation, avec le CLI de la version visée.
Voyez d'abord ce qu'il va faire ; cela ne change rien :

```bash
copalibre upgrade --check
```

### Selon votre point de départ

| Votre installation a été créée par              | Faites ceci                                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1.2.5 ou 1.2.6                                  | `copalibre upgrade --self`, puis `copalibre upgrade --check` et `copalibre upgrade`                                       |
| 1.2.1 ou antérieure (son CLI n'a pas `upgrade`) | Installez le nouveau CLI avec le script d'installation ci-dessus, puis `copalibre upgrade --check` et `copalibre upgrade` |
| Un CLI 1.2.x a déjà exécuté `copalibre upgrade` | Installez le nouveau CLI et exécutez de nouveau `copalibre upgrade`                                                       |

Ne laissez pas un CLI 1.2.x exécuter `copalibre upgrade` seul. Il inscrit la nouvelle version dans
`.env`, `docker-compose.yml` et `.copalibre/installation.json`, annonce un succès et laisse tous les
conteneurs sur les anciennes images ; au prochain redémarrage, les nouvelles images démarrent sur
l'ancien fichier Compose, ce qui ne fonctionne pas. Le nouveau CLI reconnaît une installation laissée
ainsi, quel que soit son marqueur, et termine le travail.

### Ce que fait la mise à niveau

1. Elle télécharge les nouvelles images pendant que l'installation tourne, afin que rien ne s'arrête
   s'il en manque une.
2. Elle arrête la pile, pour ne perdre aucune écriture, et sauvegarde la base de données dans
   `backups/pre-upgrade-<depuis>-to-<vers>-<date>.tar.gz`.
3. Elle remplace `docker-compose.yml` et `deploy/gateway/Caddyfile` par ceux de la nouvelle version,
   s'ils sont restés tels qu'une version les a livrés, et conserve les précédents sous
   `docker-compose.yml.<depuis>.bak` et `deploy/gateway/Caddyfile.<depuis>.bak`. Elle met à jour
   `.env` (nouveaux réglages, nouvelles étiquettes d'image, l'adresse du jeu de clés passée sous
   `/api`) et conserve `.env.<depuis>.bak` ; les valeurs que vous avez réglées sont gardées.
4. Elle déplace la base de PostgreSQL 17 vers 18 : elle restaure la sauvegarde dans un nouveau volume
   (`postgresql-data`) et compare le nombre de lignes de chaque table avant de continuer. Le volume 17
   n'est pas touché.
5. Elle démarre la nouvelle version et exécute `copalibre doctor`. Dans un terminal, doctor propose de
   configurer ce qui manque à l'installation, comme l'envoi d'e-mails ; voir [doctor](/fr/help/cli/commands/#doctor).
6. Une fois doctor passé, elle vérifie que la sauvegarde se relit, puis supprime le volume PostgreSQL
   17 (`postgres-data`) et l'image `postgres:17`. Avec `--keep-old-volume`, ils sont conservés ; la
   mise à niveau affiche les deux commandes qui les supprimeront plus tard.

La pile est arrêtée de l'étape 2 jusqu'à la réussite de l'étape 5 ; prévoyez la fenêtre selon la
taille de votre base. Le déplacement demande sur le disque de Docker un espace libre double de la taille de la base :
sans lui, la mise à niveau ne démarre pas. Copiez l'archive de sauvegarde hors de l'hôte une fois la
mise à niveau terminée.

### Si vous avez modifié docker-compose.yml

Un fichier Compose qui ne correspond à aucune version (un service ajouté, une valeur modifiée) est
laissé tel quel. La mise à niveau écrit le fichier de la nouvelle version sous
`docker-compose.yml.new`, le signale et s'arrête avant de changer quoi que ce soit d'autre. Reportez
vos modifications dans ce fichier, remplacez `docker-compose.yml` par le résultat et relancez
`copalibre upgrade`. Une configuration de gateway que vous avez modifiée est conservée, et la mise à
niveau le signale.

### Installations 1.0

La 1.0 n'avait pas de gateway : le proxy de bordure atteignait directement `web`, `api` et `events`.
Depuis la 1.1, le service `gateway` est la seule entrée, sur `COPALIBRE_PORT` (8080 par défaut).
Après la mise à niveau, dirigez votre proxy vers le gateway et réglez `COPALIBRE_APP_URL` sur
l'adresse qu'utilisent les navigateurs ; exécutez `copalibre doctor` pour le confirmer.

### Revenir en arrière

Si une étape avant doctor échoue, la mise à niveau remet les fichiers précédents, redémarre l'ancienne
version sur son volume PostgreSQL 17 intact et indique pourquoi elle s'est arrêtée. Si doctor échoue,
la nouvelle version continue de tourner et la mise à niveau affiche ces étapes sans rien supprimer.

Tant que le volume PostgreSQL 17 existe (doctor a échoué, ou vous avez passé `--keep-old-volume`) :

```bash
docker compose down
cp docker-compose.yml.<depuis>.bak docker-compose.yml
cp .env.<depuis>.bak .env
cp deploy/gateway/Caddyfile.<depuis>.bak deploy/gateway/Caddyfile   # si la mise à niveau l'a remplacé
docker compose up --detach --wait
```

Le volume PostgreSQL 18 (`<projet>_postgresql-data`) reste inutilisé ; supprimez-le avec
`docker volume rm` avant de retenter la mise à niveau si vous voulez repartir de zéro.

Une fois PostgreSQL 17 supprimé par la mise à niveau, l'archive de sauvegarde est le chemin du retour.
Installez le CLI de la version précédente dans un nouveau répertoire vide, exécutez-y
`copalibre init`, copiez l'archive dans son `backups/` et restaurez-la :

```bash
copalibre restore --file backups/pre-upgrade-<depuis>-to-<vers>-<date>.tar.gz --confirm
```

Les écritures postérieures à la mise à niveau sont perdues. Revenir à des images antérieures sur la
base déjà migrée n'est jamais un retour sûr.

### Procédure manuelle avec Compose (entre versions 2.x)

Depuis une installation 1.x, utilisez `copalibre upgrade` : sa base doit passer à PostgreSQL 18, ce
que ces étapes ne font pas.

Conservez le CLI correspondant à `.copalibre/installation.json`. Remplacer le binaire ne met à jour ni le marqueur, ni Compose, ni les références d’images. Sauvegardez PostgreSQL, les objets, la configuration et les clés de signature ; conservez les anciennes versions d’images.

```bash
copalibre backup --file backups/pre-upgrade.tar.gz
```

Dans le répertoire existant, examinez les changements Compose/configuration de la version cible, puis modifiez les deux images dans `.env`. Conservez le projet Compose et les volumes. Téléchargez et vérifiez l’image cible sans démarrer les dépendances ni appliquer les migrations :

```dotenv
COPALIBRE_IMAGE=ghcr.io/sebasoft/copalibre:1.2.6
COPALIBRE_WEB_IMAGE=ghcr.io/sebasoft/copalibre-web:1.2.6
```

```bash
docker compose pull
docker compose run --rm --no-deps upgrade-check --target-version 1.2.6
```

Après validation, prévoyez une interruption, arrêtez les processus applicatifs et faites une dernière sauvegarde ; migrez puis redémarrez. Ne redémarrez pas si la migration échoue :

```bash
docker compose stop gateway web web-ssr api events worker scheduler
copalibre backup --file backups/pre-upgrade.tar.gz
docker compose run --rm migrate && docker compose up --detach --wait
docker compose run --rm doctor
```

Ne supprimez ni ne réécrivez le marqueur pour contourner le contrôle de version. Pour les opérations de schéma entre versions, utilisez les services Compose explicites ci-dessus ; le nouveau CLI refuse `migrate` et `upgrade-check` avec l’ancien marqueur. Un nouveau répertoire `init` est une autre installation, pas une mise à niveau sur place.

Après une migration, choisir d’anciennes images ne constitue pas un retour arrière sûr. Laissez les processus d’écriture arrêtés et restaurez les sauvegardes PostgreSQL, objets et configuration dans une installation isolée de la version précédente. Vérifiez la récupération avant de basculer le trafic ; les écritures postérieures à la sauvegarde sont perdues.

## Mise à niveau selon le déploiement

Avec Compose derrière NGINX ou Caddy, conservez proxy et certificats, passez en maintenance pendant la migration et ne rechargez que la configuration modifiée après validation. Sur Kubernetes, utilisez le chart cible avec les valeurs revues et les deux images, lancez un Job de compatibilité puis vérifiez les Jobs de migration/doctor et l’ingress avant de rouvrir le trafic. Helm rollback n’annule pas les migrations de base de données. Commandes détaillées :

- [Caddy](https://github.com/SebaSOFT/copalibre/blob/main/docs/deployment/reverse-proxy/caddy.md#upgrading-copalibre-behind-caddy)
- [NGINX](https://github.com/SebaSOFT/copalibre/blob/main/docs/deployment/reverse-proxy/nginx.md#upgrading-copalibre-behind-nginx)
- [Kubernetes / Helm](https://github.com/SebaSOFT/copalibre/blob/main/docs/deployment/enterprise-kubernetes.md#upgrading-an-existing-helm-release-safely)

## Mettre à jour les modules

Chaque discipline ou profil de tournoi installé est un module versionné indépendamment du framework.

```bash
copalibre module list --outdated
```

Liste uniquement les modules installés qui ont une version publiée plus récente que celle installée.

```bash
copalibre module add <alias>@<plage>
```

Installe une version spécifique ou une plage (par exemple `@^2.0.0`) d'un module déjà installé —
réinstaller avec une version différente est la façon de mettre à jour un module. Un tournoi déjà en
cours continue de référencer la version avec laquelle il a été créé ; mettre à jour un module ne
change jamais rétroactivement un tournoi déjà en cours.

Voir la [référence des commandes](/fr/help/cli/commands/) pour le reste des options de `module`.
