---
title: MCP pour l'IA
description: Comment une IA peut exploiter CopaLibre via copalibre mcp.
capabilities: []
roles:
  - super-admin
  - admin
---

`copalibre mcp` démarre un serveur [Model Context Protocol](https://modelcontextprotocol.io) local,
uniquement sur stdio — aucun transport HTTP/SSE. Un client MCP (par exemple, un agent IA) démarre le
processus et communique via son entrée/sortie standard ; les messages de journal (la bannière, etc.)
passent par stderr, jamais mélangés avec le protocole.

## Outils d'installation

Toujours disponibles, sans jeton à configurer — ils exécutent exactement la même logique que leurs
commandes CLI équivalentes, dans le même processus :

- **`copalibre_doctor`** : valide la configuration et les dépendances (comme `copalibre doctor`).
- **`copalibre_module_list`** : liste les modules installés.
- **`copalibre_upgrade_check`** : vérifie la compatibilité des modules et les migrations en attente
  contre une version cible (`target_version`), comme `copalibre upgrade-check`.

## Outils de création de modules

Toujours disponibles, sans jeton — ils opèrent sur le système de fichiers local et Git, jamais sur
`apps/api` :

- **`copalibre_module_scaffold`** : génère un paquet de module structurellement valide, initialisé à
  partir d'un document du catalogue déjà valide, sous forme de dépôt Git local étiqueté.
- **`copalibre_module_validate_local`** : valide un paquet local sans le rechercher ni l'installer.
- **`copalibre_module_submit`** : bifurque `copalibre-modules`, publie le module sur une nouvelle
  branche, et ouvre une pull request.

C'est le scénario complet qui justifie ce serveur : une IA lit les règles d'un sport, demande à
l'opérateur les détails nécessaires, assemble le module localement, le valide, l'installe dans une
installation de développement locale pour l'essayer réellement (via `copalibre module add --source
file://...`, sans mécanisme séparé) et le soumet comme pull request — tout cela sans quitter le
protocole MCP.

## Outils d'exploitation de tournois

Enregistrés uniquement lorsque `COPALIBRE_MCP_TOKEN` et `COPALIBRE_API_URL` sont configurés — sans
jeton, ils n'apparaissent même pas dans la liste des outils du serveur, et aucun appel HTTP n'est
jamais tenté. `COPALIBRE_MCP_TOKEN` est un jeton bearer déjà valide sous le même contrat
d'authentification OIDC/JWT que le reste de l'API ; cette commande n'émet ni ne gère de jetons, elle
les transmet simplement.

- **`copalibre_get_organization`** : lit une organisation par son alias.
- **`copalibre_list_tournaments`** : liste les tournois actifs (non archivés) d'une organisation.
- **`copalibre_get_tournament`** : lit un tournoi par son alias au sein d'une organisation.
- **`copalibre_create_tournament`** : crée un tournoi à l'état de brouillon.
- **`copalibre_publish_tournament`** : publie la configuration d'un tournoi brouillon.

Il s'agit d'un ensemble initial et sélectionné, pas d'un miroir exhaustif de chaque point de
terminaison `apps/api` — l'étendre plus tard est un travail attendu, pas une limite fixe.

## Configurer un client MCP

Un client MCP typique démarre `copalibre mcp` comme sous-processus, en passant les variables
d'environnement nécessaires (`DATABASE_URL`, et optionnellement `COPALIBRE_MCP_TOKEN`/
`COPALIBRE_API_URL` pour les outils de tournoi). Voir
[`docs/MCP.md`](https://github.com/SebaSOFT/copalibre/blob/develop/docs/MCP.md) dans le dépôt pour un
exemple complet de configuration.

## Documentation pour l'IA

Le serveur MCP annonce ses propres `instructions` dans la réponse `initialize` — le même résumé que
cette page, sous la forme qu'un client MCP lit avant de choisir un outil. Cette même instance publie
aussi `/llms.txt` et `/llms-full.txt` à la racine du site d'aide, pour une IA qui parcourt plutôt les
pages rendues.
