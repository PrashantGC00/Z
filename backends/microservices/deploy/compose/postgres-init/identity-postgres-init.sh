#!/usr/bin/env bash

set -euo pipefail

: "${IDENTITY_DB_PASSWORD:?IDENTITY_DB_PASSWORD must be set}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v password="$IDENTITY_DB_PASSWORD" <<'EOSQL'
CREATE ROLE identity LOGIN PASSWORD :'password';
CREATE DATABASE identity OWNER identity;

-- Only the owner (and superusers) may connect. Without this, every role,
-- including graph, can connect via the default PUBLIC grant.
REVOKE CONNECT, TEMPORARY ON DATABASE identity FROM PUBLIC;
EOSQL
