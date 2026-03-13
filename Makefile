# Meridian Blog Engine - Makefile
# Quick commands for local development

.PHONY: help install dev build up down logs db-migrate db-reset

help: ## Show this help message
	@echo "Meridian Blog Engine - Available Commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

# Development Commands

dev: ## Run with Docker Compose (database + app)
	@echo "🚀 Starting Meridian with Docker Compose..."
	docker-compose up --build

dev-detached: ## Run in background mode
	@echo "🚀 Starting Meridian in detached mode..."
	docker-compose up --build -d

stop: ## Stop all services
	@echo "🛑 Stopping services..."
	docker-compose down

down: ## Stop and remove all containers/volumes
	@echo "🧹 Cleaning up containers and volumes..."
	docker-compose down -v

logs: ## View logs
	docker-compose logs -f app

# Database Commands

db-migrate: ## Run database migrations
	@echo "🔄 Running migrations..."
	docker-compose exec app deno run --allow-all db/migrate.ts

db-reset: ## Reset database (⚠️ DESTROSES DATA)
	@echo "⚠️  Resetting database..."
	docker-compose down -v
	docker-compose up -d db
	@sleep 5
	docker-compose exec app deno run --allow-all db/migrate.ts

db-shell: ## Open PostgreSQL shell
	docker-compose exec db psql -U meridian -d meridian

# Local Development (without Docker)

install: ## Install Deno (if not already installed)
	@echo "📦 Checking Deno installation..."
	@which deno > /dev/null || (echo "Installing Deno..." && curl -fsSL https://deno.land/install.sh | sh)
	@deno --version

dev-local: install ## Run locally with Deno (requires PostgreSQL running)
	@echo "🚀 Starting Meridian locally..."
	@echo "Make sure PostgreSQL is running on localhost:5432"
	@deno task dev

# Build Commands

build: ## Build Docker image
	docker-compose build

build-prod: ## Build production Docker image
	docker build -t meridian:latest .

# Utility Commands

shell: ## Open shell in app container
	docker-compose exec app sh

lint: ## Run linter
	deno lint

fmt: ## Format code
	deno fmt

test: ## Run tests
	deno test --allow-all
