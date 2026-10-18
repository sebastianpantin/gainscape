SUPABASE := npx supabase
FUNCTIONS_PID := .functions-serve.pid
FUNCTIONS_LOG := .functions-serve.log
FUNCTIONS_STAMP := .functions-serve.stamp
FUNCTIONS_ENV := supabase/functions/.env.local

ifneq ($(wildcard .stack.env),)
include .stack.env
export $(shell sed -n 's/^\([A-Z_][A-Z0-9_]*\)=.*/\1/p' .stack.env)
endif

PROJECT_ID = $(or $(SUPABASE_PROJECT_ID),gainscape)
CI_EXCLUDED := studio,imgproxy,vector,logflare,postgres-meta,supavisor
PARALLEL_JOBS ?= $(shell nproc 2>/dev/null || echo 4)
OUTPUT_SYNC := $(if $(filter-out 0 1 2 3,$(firstword $(subst ., ,$(MAKE_VERSION)))),--output-sync=target)
PARALLEL_MAKE = $(MAKE) --no-print-directory --keep-going $(OUTPUT_SYNC) -j$(PARALLEL_JOBS)
CHECKS := format-check lint typecheck-web typecheck-domain typecheck-node typecheck-sw check-functions catalog-check icons-check docs-check secrets-scan

.PHONY: start ci-start ci-changes docs-check ci-logs stop reset functions dev build build-local preview sw-kill-switch test typecheck lint format format-check check check-functions catalog catalog-check icons icons-check test-catalog test-domain test-web test-deploy test-unit changelog-unreleased test-integration test-db rebuild-caches sim sim-check typecheck-web typecheck-domain typecheck-node typecheck-sw e2e e2e-smoke e2e-webkit e2e-pwa screenshots secrets-scan hooks build-pages e2e-pages deploy set-loot-secret rebuild-caches-hosted backup-hosted invite-tester ban-tester remove-tester

start:
	$(SUPABASE) start
	$(MAKE) functions

ci-start:
	$(SUPABASE) start -x $(CI_EXCLUDED)
	node scripts/ci-web-env.mjs
	$(MAKE) functions

ci-logs:
	@mkdir -p ci-logs
	@for container in $$(docker ps -a --format '{{.Names}}' | grep -E '^supabase_.*_$(PROJECT_ID)$$'); do \
		docker logs "$$container" > "ci-logs/$$container.log" 2>&1; \
	done
	@ls ci-logs

functions:
	@node scripts/ensure-loot-secret.mjs
	@stamp="$$(cksum < $(FUNCTIONS_ENV))"; \
	if [ -f $(FUNCTIONS_PID) ] && kill -0 $$(cat $(FUNCTIONS_PID)) 2>/dev/null && [ "$$(cat $(FUNCTIONS_STAMP) 2>/dev/null)" = "$$stamp" ]; then \
		echo "Edge functions already served (pid $$(cat $(FUNCTIONS_PID)))."; \
	else \
		if [ -f $(FUNCTIONS_PID) ] && kill -0 $$(cat $(FUNCTIONS_PID)) 2>/dev/null; then \
			echo "Restarting edge functions: $(FUNCTIONS_ENV) changed since they started."; \
			stale=$$(cat $(FUNCTIONS_PID)); kill $$stale; \
			while kill -0 $$stale 2>/dev/null; do sleep 0.2; done; \
		fi; \
		nohup $(SUPABASE) functions serve --env-file $(FUNCTIONS_ENV) > $(FUNCTIONS_LOG) 2>&1 & echo $$! > $(FUNCTIONS_PID); \
		echo "$$stamp" > $(FUNCTIONS_STAMP); \
	fi
	@node scripts/wait-for-functions.mjs

stop:
	@if [ -f $(FUNCTIONS_PID) ]; then kill $$(cat $(FUNCTIONS_PID)) 2>/dev/null || true; rm -f $(FUNCTIONS_PID) $(FUNCTIONS_STAMP); fi
	$(SUPABASE) stop

reset:
	$(SUPABASE) db reset
	$(MAKE) functions

dev:
	@node scripts/lan-url.mjs
	npx vite web --host

build:
	npx vite build web

deploy:
	node scripts/deploy/deploy.ts

set-loot-secret:
	node scripts/deploy/set-loot-secret.ts

rebuild-caches-hosted:
	node scripts/deploy/rebuild-hosted.ts $(if $(filter 1,$(ALL)),--all)

invite-tester:
	node scripts/deploy/invite-tester.ts

ban-tester:
	node scripts/deploy/ban-tester.ts

remove-tester:
	node scripts/deploy/remove-tester.ts

backup-hosted:
	node scripts/deploy/backup-hosted.ts

build-pages:
	node scripts/deploy/build-pages.ts

build-local:
	npx vite build web --mode development

sw-kill-switch:
	node scripts/build-kill-switch.ts

preview: build-local
	@node scripts/lan-url.mjs --preview
	npx vite preview web --host

typecheck:
	@$(PARALLEL_MAKE) typecheck-web typecheck-domain typecheck-node typecheck-sw

typecheck-web:
	npx tsc --noEmit -p tsconfig.web.json

typecheck-domain:
	npx tsc --noEmit -p tsconfig.domain.json

typecheck-node:
	npx tsc --noEmit -p tsconfig.node.json

typecheck-sw:
	npx tsc --noEmit -p tsconfig.sw.json

ESLINT_CACHE := --cache --cache-strategy content --cache-location node_modules/.cache/eslint/
PRETTIER_CACHE := --cache --cache-strategy content --cache-location node_modules/.cache/prettier/cache.json

lint:
	npx eslint . --max-warnings 0 $(ESLINT_CACHE)

format:
	npx prettier --write --ignore-unknown $(PRETTIER_CACHE) .

format-check:
	npx prettier --check --ignore-unknown $(PRETTIER_CACHE) .

check:
	@$(PARALLEL_MAKE) $(CHECKS)

hooks:
	git config core.hooksPath .githooks

secrets-scan:
	node scripts/deploy/secrets-scan.ts

catalog:
	node scripts/catalog/generate.ts

catalog-check:
	node scripts/catalog/generate.ts --check

icons:
	node scripts/icons/build.ts

icons-check:
	node scripts/icons/build.ts --check

docs-check:
	node scripts/docs/agents-size.ts

check-functions:
	@for function_dir in supabase/functions/*/; do \
		if [ -f "$${function_dir}deno.json" ]; then deno check --config "$${function_dir}deno.json" "$${function_dir}index.ts" || exit 1; fi; \
	done

rebuild-caches: functions
	node scripts/rebuild-caches.mjs $(if $(filter 1,$(ALL)),--all)

test-catalog:
	npx vitest run tests/catalog

test-domain:
	npx vitest run tests/domain

test-web:
	npx vitest run tests/web

test-deploy:
	npx vitest run tests/deploy

test-unit:
	npx vitest run --project unit

ci-changes:
	@node scripts/ci-changes.ts $(CI_BASE)

changelog-unreleased:
	@node scripts/changelog/unreleased.ts

test-integration: functions
	npx vitest run tests/integration

test-db:
	@node scripts/assert-local-db.mjs
	$(SUPABASE) test db --local

CHROMIUM_PATH ?= $(shell command -v chromium 2>/dev/null)

e2e: functions
	CHROMIUM_PATH="$(CHROMIUM_PATH)" npx playwright test --project=chromium $(E2E_ARGS)

e2e-smoke: functions
	CHROMIUM_PATH="$(CHROMIUM_PATH)" npx playwright test --project=chromium --grep @smoke $(E2E_ARGS)

e2e-webkit: functions
	npx playwright test --project=webkit $(E2E_ARGS)

e2e-pages: functions
	CHROMIUM_PATH="$(CHROMIUM_PATH)" npx playwright test -c playwright.pages.config.ts

e2e-pwa: functions
	$(MAKE) build-local
	CHROMIUM_PATH="$(CHROMIUM_PATH)" npx playwright test -c playwright.pwa.config.ts

screenshots: functions
	CHROMIUM_PATH="$(CHROMIUM_PATH)" npx playwright test -c scripts/screenshots/playwright.config.ts

sim:
	node scripts/balance/report.ts

sim-check:
	npx vitest run tests/balance

test: check test-catalog test-domain test-web test-deploy test-integration test-db
