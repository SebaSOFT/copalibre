export COPALIBRE_IMAGE=copalibre:ci
export COPALIBRE_WEB_IMAGE=copalibre-web:ci
export POSTGRES_PASSWORD=copalibre_e2e_only
export COPALIBRE_APP_URL=http://localhost:4321
export COPALIBRE_API_URL=http://localhost:3001
export COPALIBRE_BOOTSTRAP_TOKEN=copalibre_e2e_bootstrap_only
export COPALIBRE_JWKS_URI=http://jwks-stub/jwks.json
export COPALIBRE_JWT_ISSUER=http://jwks-stub
export COPALIBRE_JWT_AUDIENCE=copalibre
export COPALIBRE_OIDC_CLIENT_ID=copalibre-compose-e2e
export COPALIBRE_EMAIL_PROVIDER=smtp
export COPALIBRE_EMAIL_FROM=e2e@copalibre.invalid
export COPALIBRE_SMTP_URL=smtp://host.docker.internal:1025

docker compose build web
docker compose up -d web
