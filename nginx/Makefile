COMPOSE_FILE := compose.nginx.yaml
MONOLITH_UPSTREAM ?= host.docker.internal:3000

export MONOLITH_UPSTREAM

.PHONY: help network up full down

help:
	@echo "Available commands:"
	@echo "  make up    - Start nginx (proxy to monolith on host :3000)"
	@echo "  make full  - Start nginx (proxy to z-monolith:3000)"
	@echo "  make down  - Stop containers"
	@echo "  make help  - Show this help"

network:
	@docker network inspect z_edge >/dev/null 2>&1 || docker network create z_edge

up: network
	docker compose -f $(COMPOSE_FILE) up -d

full: network
	docker compose -f $(COMPOSE_FILE) up -d
full: MONOLITH_UPSTREAM = z-monolith:3000

down:
	docker compose -f $(COMPOSE_FILE) down
