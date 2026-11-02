COMPOSE_FILE := compose.nginx.yaml
EDGE_GW := $(shell docker network inspect z_edge -f '{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null)

MONOLITH_UPSTREAM ?= $(EDGE_GW):3000
IDENTITY_UPSTREAM ?= z-identity:4001

export MONOLITH_UPSTREAM
export IDENTITY_UPSTREAM

.PHONY: help network up full down

help:
	@echo "Available commands:"
	@echo "  make up    - Start nginx (proxy to monolith on host :3000)"
	@echo "  make full  - Start nginx (proxy to z-monolith:3000)"
	@echo "  make down  - Stop containers"
	@echo "  make help  - Show this help"
	@echo ""
	@echo "Ports: 8081 monolith, 8082 microservices (identity: $(IDENTITY_UPSTREAM)), 8083 hybrid"

network:
	@docker network inspect z_edge >/dev/null 2>&1 || docker network create z_edge

up: network
	docker compose -f $(COMPOSE_FILE) up -d

full: network
	docker compose -f $(COMPOSE_FILE) up -d
full: MONOLITH_UPSTREAM = z-monolith:3000

down:
	docker compose -f $(COMPOSE_FILE) down
