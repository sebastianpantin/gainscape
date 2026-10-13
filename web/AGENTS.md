# web

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

The React 19 PWA and its Vite root. Source lives in `src/`, static assets in `public/`, and the build-time service worker tooling in `build/`; each has its own `AGENTS.md`. The build output goes to `web/dist/` (ignored, never edit).

## Map

- `vite.config.ts`: root, `@domain` alias, the `/sb` proxy to the local Supabase API (for both `server` and `preview`; the PWA e2e suite runs on preview), the service worker plugin, the `__CHANGELOG__` and `__APP_BUILD__` defines, and vendor chunk groups.
- `changelog.yaml`: release history shown in the app, newest first; each entry's `prs` lists covered PR numbers and is kept out of the bundle. The app version is the newest entry (`APP_VERSION`); there is no other version constant.
- `index.html`, `.env.development`.

## Rules and gotchas

- `src/zod-config.ts` joins the `vendor-zod` chunk so `jitless` is set as soon as zod loads, before any chunk can trip zod's `new Function` probe against the Pages CSP (`e2e/pages/csp.spec.ts`). Keep it in that chunk group.
- `.env.development` holds the local CLI stack's publishable key, the same for every local install. `VITE_SUPABASE_URL` is deliberately unset locally so the client uses the `/sb` proxy. Never commit a hosted URL or key; production values come from the build environment (`../docs/production-auth.md`).
- `@vitejs/plugin-basic-ssl` is skipped when `GAINSCAPE_PLAIN_HTTP` is set (PWA e2e serves plain http).
- `sw.js` exists only after `vite build`; the dev server registers no worker.
- `vite.config.ts` reads `changelog.yaml` once at startup: restart `make dev` after editing it. `src/lib/platform/changelog-rules.ts` validates it on every build, and `make deploy` refuses until every user-facing merged PR is in some entry's `prs`.
- A new build-time constant is declared in both `src/vite-env.d.ts` and `vite.config.ts`.
- Node-loaded files (`vite.config.ts`, `build/*.ts`) use `.ts` extensions and `import.meta.dirname`.
- The `@domain` alias is also in `tsconfig.json` and `vitest.config.ts`. Change all three together.
- Ports come from `GAINSCAPE_WEB_PORT` and `GAINSCAPE_PREVIEW_PORT` (`build/ports.ts`) so a second worktree stack can run side by side.
- Use `make dev`, `make build-local` (development-mode build for the PWA e2e suite) and `make preview`, never `npm run` variants.

## Testing

- No unit test for `vite.config.ts`. `make e2e` and `make e2e-pwa` exercise it; a change to the production build output belongs in `e2e/pwa/` or `e2e/pages/`. The stack is required.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
