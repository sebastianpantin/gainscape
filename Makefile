SUPABASE := npx supabase
FUNCTIONS_PID := .functions-serve.pid
FUNCTIONS_LOG := .functions-serve.log
FUNCTIONS_STAMP := .functions-serve.stamp
FUNCTIONS_ENV := supabase/functions/.env.local

ifneq ($(wildcard .stack.env),)
include .stack.env
export $(shell sed -n 's/^\([A-Z_][A-Z0-9_]*\)=.*/\1/p' .stack.env)
endif

.PHONY: start stop reset functions dev types test typecheck lint format format-check check check-functions catalog catalog-check test-catalog test-domain test-web test-integration rebuild-caches sim sim-check e2e

start:
	$(SUPABASE) start
	$(MAKE) functions

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

types:
	$(SUPABASE) gen types typescript --local > web/src/lib/database.types.ts

typecheck:
	npx tsc --noEmit -p tsconfig.json

lint:
	npx eslint . --max-warnings 0

format:
	npx prettier --write --ignore-unknown .

format-check:
	npx prettier --check --ignore-unknown .

check: format-check lint typecheck check-functions catalog-check

catalog:
	node scripts/catalog/generate.ts

catalog-check:
	node scripts/catalog/generate.ts --check

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

CHROMIUM_PATH ?= $(shell command -v chromium 2>/dev/null)

e2e: functions
	CHROMIUM_PATH="$(CHROMIUM_PATH)" npx playwright test

sim:
	node scripts/balance/report.ts

sim-check:
	npx vitest run tests/balance

test: check test-catalog test-domain test-web test-integration
