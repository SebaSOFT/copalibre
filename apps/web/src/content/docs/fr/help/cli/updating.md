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

Conservez le CLI correspondant à `.copalibre/installation.json`. Remplacer le binaire ne met à jour ni le marqueur, ni Compose, ni les références d’images. Sauvegardez PostgreSQL, les objets, la configuration et les clés de signature ; conservez les anciennes versions d’images.

```bash
copalibre backup --file backups/pre-upgrade.tar.gz
```

Dans le répertoire existant, examinez les changements Compose/configuration de la version cible, puis modifiez les deux images dans `.env`. Conservez le projet Compose et les volumes. Téléchargez et vérifiez l’image cible sans démarrer les dépendances ni appliquer les migrations :

```dotenv
COPALIBRE_IMAGE=ghcr.io/sebasoft/copalibre:1.2.0
COPALIBRE_WEB_IMAGE=ghcr.io/sebasoft/copalibre-web:1.2.0
```

```bash
docker compose pull
docker compose run --rm --no-deps upgrade-check --target-version 1.2.0
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
