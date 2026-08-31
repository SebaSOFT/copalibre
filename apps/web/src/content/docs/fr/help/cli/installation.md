---
title: Installation
description: Comment installer CopaLibre à partir de zéro avec le CLI copalibre.
capabilities: []
roles:
  - super-admin
---

## Prérequis

Docker et Docker Compose sur l'hôte. `copalibre` est un binaire autonome — aucune installation de
Node.js requise. Il n'est pas non plus nécessaire d'installer PostgreSQL ni ses outils clients — ils
s'exécutent dans les conteneurs que `copalibre` gère.

`install.sh` prend en charge Linux (x86_64/arm64), macOS (x86_64/arm64, y compris Apple Silicon sous
Rosetta), et Windows (x86_64).

## Étapes

```bash
curl -fsSL https://www.copalibre.app/install.sh | bash
mkdir ma-ligue && cd ma-ligue
copalibre init      # écrit les valeurs par défaut non secrètes dans .env
```

Modifiez `.env` : le mot de passe PostgreSQL, `COPALIBRE_BOOTSTRAP_TOKEN`, JWKS/issuer/audience OIDC,
l'ID client du navigateur, et un fournisseur d'email.

```bash
copalibre doctor    # valide la configuration avant de démarrer quoi que ce soit
copalibre start     # démarre PostgreSQL, exécute doctor, et lance tous les processus
copalibre create-admin --organization-alias ma-ligue --organization-name "Ma Ligue" --email admin@exemple.com
```

`docker-compose.yml` ne termine volontairement pas TLS — un proxy inverse (Caddy ou NGINX) se place
en périphérie. Des configurations d'exemple se trouvent dans `deploy/proxy/` ; vérifiez l'installation
avec `copalibre doctor --check-proxy --proxy-url https://evenements.exemple/events/proxy-check`.

Détails complets sur les données persistantes, la sauvegarde/restauration et le proxy inverse :
`docs/self-hosting.md` dans le dépôt. Mettre à jour le binaire `copalibre` lui-même :
[Mise à jour](/fr/help/cli/updating/).
