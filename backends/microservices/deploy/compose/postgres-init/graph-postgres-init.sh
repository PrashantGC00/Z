#!/usr/bin/env bash

set -euo pipefail

: "${GRAPH_DB_PASSWORD:?GRAPH_DB_PASSWORD must be set}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v password="$GRAPH_DB_PASSWORD" <<'EOSQL'
CREATE ROLE graph LOGIN PASSWORD :'password';
CREATE DATABASE graph OWNER graph;

-- Only the owner (and superusers) may connect. Without this, every role,
-- including identity, can connect via the default PUBLIC grant.
REVOKE CONNECT, TEMPORARY ON DATABASE graph FROM PUBLIC;
EOSQL
