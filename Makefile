SUPABASE := npx supabase
FUNCTIONS_PID := .functions-serve.pid
FUNCTIONS_LOG := .functions-serve.log

.PHONY: start stop reset functions dev types test typecheck lint format format-check check check-functions test-domain test-integration rebuild-caches sim sim-check e2e

start:
	$(SUPABASE) start
	$(MAKE) functions

functions:
	@if [ -f $(FUNCTIONS_PID) ] && kill -0 $$(cat $(FUNCTIONS_PID)) 2>/dev/null; then \
		echo "Edge functions already served (pid $$(cat $(FUNCTIONS_PID)))."; \
	else \
		nohup $(SUPABASE) functions serve > $(FUNCTIONS_LOG) 2>&1 & echo $$! > $(FUNCTIONS_PID); \
	fi
	@node scripts/wait-for-functions.mjs

stop:
	@if [ -f $(FUNCTIONS_PID) ]; then kill $$(cat $(FUNCTIONS_PID)) 2>/dev/null || true; rm -f $(FUNCTIONS_PID); fi
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

check: format-check lint typecheck check-functions

check-functions:
	@for function_dir in supabase/functions/*/; do \
		if [ -f "$${function_dir}deno.json" ]; then deno check --config "$${function_dir}deno.json" "$${function_dir}index.ts" || exit 1; fi; \
	done

rebuild-caches: functions
	node scripts/rebuild-caches.mjs

test-domain:
	npx vitest run tests/domain

test-integration: functions
	npx vitest run tests/integration

CHROMIUM_PATH ?= $(shell command -v chromium 2>/dev/null)

e2e: functions
	CHROMIUM_PATH="$(CHROMIUM_PATH)" npx playwright test

sim:
	node scripts/balance/report.ts

sim-check:
	npx vitest run tests/balance

test: check test-domain test-integration
