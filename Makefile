# Local entry points for the checks CI runs (.github/workflows/ci.yml).
# `make check` before pushing; `make ci` adds the audit and the image.

.DEFAULT_GOAL := help
.PHONY: help check ci format format-check lint typecheck test check-unused check-migrations audit image commitlint

help: ## Show the targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-18s %s\n", $$1, $$2}'

node_modules: package.json bun.lock
	bun install --frozen-lockfile
	@touch node_modules

check: format-check lint typecheck test check-unused check-migrations ## Format check, lint, type check, tests, unused code, migrations

ci: check commitlint audit image ## Everything CI gates on (needs docker)

format: node_modules ## Format the code
	bun run format

format-check: node_modules ## Check formatting, no write
	bun run format:check

lint: node_modules ## Lint (bun lint from the pinned canary)
	bun run lint

typecheck: node_modules ## Type check
	bun check

test: node_modules ## Run the tests
	bun test

check-unused: node_modules ## Files, exports and dependencies nothing uses (knip)
	bun run check:unused

check-migrations: node_modules ## The committed migrations match the schema
	bun run check:migrations

audit: node_modules ## Known vulnerabilities, high severity and above
	bun audit --audit-level=high

image: node_modules ## Build the image and smoke test it
	docker build -t whiskerfile:ci .
	.github/scripts/image-smoke.sh whiskerfile:ci

commitlint: node_modules ## Check this branch's commit messages (Conventional Commits)
	bun x commitlint --from origin/main
