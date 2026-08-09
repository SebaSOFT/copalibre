---
title: Référence des commandes
description: Chaque commande du CLI copalibre, son usage et ses options.
---

Chaque commande répond à `--help`/`-h` avec exactement ce texte d'usage, généré depuis une source
unique dans le CLI lui-même — cette page ne peut pas décrire une commande différemment de ce que le
CLI fait réellement.

## init

`copalibre init [--file <chemin>]`

Écrit les valeurs par défaut non secrètes et liste les secrets requis.

- `--file <chemin>` : fichier cible (par défaut `.env`)

## doctor

`copalibre doctor [--check-proxy] [--proxy-url <url>]`

Valide la configuration et les dépendances avant de démarrer.

- `--check-proxy` : vérifie aussi la configuration du proxy inverse
- `--proxy-url <url>` : URL publique à tester quand `--check-proxy` est utilisé

## dev

`copalibre dev [--hybrid]`

Exécute un environnement de développement, conteneurisé ou hybride.

- `--hybrid` : infrastructure dans Docker, processus applicatifs sur l'hôte

## start

`copalibre start`

Démarre PostgreSQL, exécute doctor, et lance tous les rôles de processus.

## migrate

`copalibre migrate`

Exécute les migrations de base de données en attente.

## backup

`copalibre backup [--file <chemin>] [--retain <n>] [--dry-run]`

Crée un **paquet de sauvegarde** compressé (`.tar.gz`) sous `backups/`, avec le dump PostgreSQL et un
manifeste (date et version de CopaLibre). Applique la rétention : après une sauvegarde réussie,
supprime les paquets plus anciens au-delà de `--retain`. Ne supprime jamais que les fichiers
correspondant au motif de nommage des paquets (`copalibre-<date>.tar.gz`) — ne touche jamais aucun
autre fichier sous `backups/`.

- `--file <chemin>` : destination du paquet, dans `backups/` (par défaut : un nom horodaté)
- `--retain <n>` : paquets à conserver après cette sauvegarde (par défaut : 5)
- `--dry-run` : affiche le plan de sauvegarde sans l'exécuter

Les données des modules installés (descripteurs de discipline, profils de tournoi) résident dans
PostgreSQL, donc elles sont incluses dans le dump. Les octets d'objets dans le stockage d'objets
(`object-storage-data`) sont hors du champ de cette commande — sauvegardez-les séparément au niveau
de l'infrastructure, comme le guide d'autohébergement le signale déjà.

## restore

`copalibre restore --file <chemin> (--confirm | --dry-run) [--allow-newer-backup]`

Extrait un paquet de sauvegarde, restaure son dump PostgreSQL, exécute les migrations en attente et
confirme que le schéma appliqué correspond à cette installation — tout en une seule invocation.

- `--file <chemin>` : paquet à restaurer, dans `backups/`
- `--confirm` : requis pour exécuter réellement la restauration
- `--dry-run` : affiche le plan de restauration sans l'exécuter
- `--allow-newer-backup` : permet de restaurer un paquet produit par une version de CopaLibre plus
  récente que celle en cours d'exécution (refusé par défaut)

Après un `pg_restore` réussi, `restore` exécute automatiquement `copalibre migrate` puis ouvre une
connexion pour vérifier que la version du schéma appliqué correspond exactement à ce que cette
installation attend (la même vérification que `GET /ready` utilise) — ainsi une restauration ne
laisse jamais silencieusement le code et la base de données désynchronisés. Si la migration échoue,
`restore` le signale avec son code de sortie sans prétendre réussir ; réessayez avec `copalibre
migrate` puis `copalibre doctor`.

Un paquet dont le manifeste enregistre une version de CopaLibre plus récente que celle en cours
d'exécution est refusé avant de toucher la base de données, en nommant les deux versions — mettez
d'abord à jour cette installation, ou passez `--allow-newer-backup` si vous le souhaitez vraiment.

## upgrade-check

`copalibre upgrade-check --target-version <semver>`

Vérifie la compatibilité des modules installés et les migrations en attente avant la mise à jour.

- `--target-version <semver>` : version de CopaLibre contre laquelle vérifier les modules et les
  migrations

Se termine avec un code de sortie non nul si un module installé cesserait d'être compatible avec la
version cible. Voir [mise à jour](/help/cli/updating/) pour la séquence complète.

## create-admin

`copalibre create-admin --organization-alias <alias> --organization-name <nom> --email <email>`

Crée le premier compte administrateur d'une organisation.

## module

`copalibre module <add|list|remove|verify>`

Gère les modules de discipline et de profil de tournoi installés.

### module add

`copalibre module add <alias>[@plage] [--source <url>] [--allow-unsatisfied-capabilities]`

Installe un module par alias, éventuellement fixé à une plage de versions.

- `--source <url>` : une source alternative explicitement activée, au lieu de la source sélectionnée
- `--allow-unsatisfied-capabilities` : installe même si les capacités requises déclarées ne sont pas
  encore satisfaites

### module list

`copalibre module list [--outdated]`

Liste les modules installés, ou seulement ceux ayant une version publiée plus récente.

- `--outdated` : affiche seulement les modules ayant une version publiée plus récente

### module remove

`copalibre module remove <alias>`

Supprime un module installé qu'aucun tournoi démarré ne référence.

### module verify

`copalibre module verify`

Revalide chaque module installé contre la version du core en cours d'exécution.

### module scaffold

`copalibre module scaffold <discipline|tournament-profile> <alias> [--author <nom>] [--licence <licence>] [--name <nom>] [--source-url <url>] [--output <dossier>]`

Génère un paquet de module structurellement valide pour commencer la création — initialisé à partir
d'un des documents déjà valides du catalogue CopaLibre, pas une supposition aveugle du schéma —
comme un dépôt Git local étiqueté, prêt à être édité, validé et installé/soumis.

- `--author <nom>` : auteur de l'attribution (par défaut : Unknown)
- `--licence <licence>` : identifiant SPDX (par défaut : AGPL-3.0-only)
- `--name <nom>` : nom de déploiement (par défaut : l'alias)
- `--source-url <url>` : URL source de l'attribution
- `--output <dossier>` : où écrire le dépôt du module (par défaut : `modules/<alias>`)

### module validate-local

`copalibre module validate-local <chemin>`

Valide un paquet de module local sans le rechercher ni l'installer — la même vérification que
`module add`/`module verify` appliquent déjà.

### module submit

`copalibre module submit <chemin> [--upstream <owner/repo>] [--base <branche>]`

Bifurque `copalibre-modules`, copie le module local sur une nouvelle branche, la publie, et ouvre une
pull request.

- `--upstream <owner/repo>` : dépôt cible (par défaut : `SebaSOFT/copalibre-modules`)
- `--base <branche>` : branche de base de la pull request (par défaut : `main`)

## mcp

`copalibre mcp`

Démarre un serveur local Model Context Protocol (MCP) sur stdio, pour qu'une IA puisse exploiter
CopaLibre. Voir le [détail des outils MCP](/help/cli/mcp/).
