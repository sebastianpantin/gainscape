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
CI_EXCLUDED := studio,imgproxy,vector,logflare,storage-api,realtime,postgres-meta,supavisor

.PHONY: start ci-start ci-logs stop reset functions dev build-local preview types test typecheck lint format format-check check check-functions catalog catalog-check icons icons-check test-catalog test-domain test-web test-integration test-db rebuild-caches sim sim-check e2e e2e-pwa

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

build-local:
	npx vite build web --mode development

preview: build-local
	@node scripts/lan-url.mjs --preview
	npx vite preview web --host

types:
	$(SUPABASE) gen types typescript --local > web/src/lib/database.types.ts

typecheck:
	npx tsc --noEmit -p tsconfig.json
	npx tsc --noEmit -p tsconfig.sw.json

lint:
	npx eslint . --max-warnings 0

format:
	npx prettier --write --ignore-unknown .

format-check:
	npx prettier --check --ignore-unknown .

check: format-check lint typecheck check-functions catalog-check icons-check

catalog:
	node scripts/catalog/generate.ts

catalog-check:
	node scripts/catalog/generate.ts --check

icons:
	node scripts/icons/build.ts

icons-check:
	node scripts/icons/build.ts --check

check-functions:
	@for function_dir in supabase/functions/*/; do \
		if [ -f "$${function_dir}deno.json" ]; then deno check --config "$${function_dir}deno.json" "$${function_dir}index.ts" || exit 1; fi; \
	done

rebuild-caches: functions
	node scripts/rebuild-caches.mjs

test-catalog:
	npx vitest run tests/catalog

test-domain:
	npx vitest run tests/domain

test-web:
	npx vitest run tests/web

test-integration: functions
	npx vitest run tests/integration

test-db:
	@node scripts/assert-local-db.mjs
	$(SUPABASE) test db --local

CHROMIUM_PATH ?= $(shell command -v chromium 2>/dev/null)

e2e: functions
	CHROMIUM_PATH="$(CHROMIUM_PATH)" npx playwright test

e2e-pwa: functions
	$(MAKE) build-local
	GAINSCAPE_PLAIN_HTTP=1 CHROMIUM_PATH="$(CHROMIUM_PATH)" npx playwright test -c playwright.pwa.config.ts

sim:
	node scripts/balance/report.ts

sim-check:
	npx vitest run tests/balance

test: check test-catalog test-domain test-web test-integration test-db
