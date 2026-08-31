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
curl -fsSL https://www.copalibre.app/install.sh | bash
```

Cela ne remplace que le binaire `copalibre`. Cela n'a aucun effet sur une installation en cours
d'exécution — voir ci-dessous pour mettre à jour le framework et ses modules.

## Mettre à jour le framework

Séquence recommandée, non destructive :

1. **Sauvegardez** avant de toucher à quoi que ce soit : `./copalibre backup --file backups/pre-upgrade.dump`.
2. **Mettez à jour** le checkout ou la référence d'image vers la nouvelle version (ne redémarrez pas
   encore les services). Si cette installation a été créée avec `copalibre init` (sans checkout, voir
   la [référence des commandes](/fr/help/cli/commands/)), son répertoire reste fixé à la version de
   CLI qui l'a créée — `migrate`/`upgrade-check` refusent avec un message clair en cas de version
   différente, donc mettez à jour en exécutant le CLI de la nouvelle version contre le même
   répertoire, plutôt que de mélanger les versions de CLI.
3. **Vérifiez la compatibilité** avec la nouvelle version, sans rien redémarrer :
   ```bash
   ./copalibre upgrade-check --target-version <nouvelle-version>
   ```
   Signale si un module installé cesserait d'être compatible avec cette version (même vérification
   que `module verify` utilise contre la version en cours d'exécution, mais contre la version cible),
   et liste les migrations de base de données en attente — sans en appliquer aucune. Se termine avec
   un code de sortie non nul si un module deviendrait incompatible ; corrigez cela avant de continuer.
4. **Redémarrez** avec la nouvelle version (`./copalibre start` ou `docker compose up --detach
--wait`). Les migrations en attente s'appliquent automatiquement, dans l'ordre, avant qu'un rôle
   de processus commence à servir du trafic — pas une étape manuelle séparée.

## Mettre à jour les modules

Chaque discipline ou profil de tournoi installé est un module versionné indépendamment du framework.

```bash
./copalibre module list --outdated
```

Liste uniquement les modules installés qui ont une version publiée plus récente que celle installée.

```bash
./copalibre module add <alias>@<plage>
```

Installe une version spécifique ou une plage (par exemple `@^2.0.0`) d'un module déjà installé —
réinstaller avec une version différente est la façon de mettre à jour un module. Un tournoi déjà en
cours continue de référencer la version avec laquelle il a été créé ; mettre à jour un module ne
change jamais rétroactivement un tournoi déjà en cours.

Voir la [référence des commandes](/fr/help/cli/commands/) pour le reste des options de `module`.
