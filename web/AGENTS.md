# web

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-09

## Purpose

The React 19 PWA and its Vite root. `vite.config.ts` sets `web/` as the root, aliases `@domain` to the shared game engine, proxies `/sb` to the local Supabase API, and registers the custom service worker build plugin. Source lives in `src/`, static assets in `public/`, and the build-time service worker tooling in `build/`. The build output goes to `web/dist/` (ignored, never edit).

## Key Files

| File               | Description                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vite.config.ts`   | Vite config: `@vitejs/plugin-react`, `@vitejs/plugin-basic-ssl` (skipped when `GAINSCAPE_PLAIN_HTTP` is set), `serviceWorkerPlugin()`, `@domain` alias, `__CHANGELOG__` define (the bundled releases from `changelog.yaml`, read by `build/changelog.ts`), `__APP_BUILD__` define (git short hash plus date, or `dev`), and the `/sb` proxy for both dev server and preview |
| `changelog.yaml`   | Release history shown in the app: newest entry first, each with `prs` (PR numbers it covers, kept out of the bundle), `version`, `date`, `title` and `items`. Validated by `src/lib/changelog-rules.ts` on every build; `make deploy` refuses until every user-facing merged PR is in some entry's `prs` (`../.claude/skills/changelog/SKILL.md`)                           |
| `index.html`       | Single HTML entry: viewport with `viewport-fit=cover`, theme colour, iOS web app meta, manifest and icon links, `#root`, and `/src/main.tsx`                                                                                                                                                                                                                                |
| `.env.development` | Committed local-only publishable key of the Supabase CLI stack (`VITE_SUPABASE_PUBLISHABLE_KEY`), the same for every local install. `VITE_SUPABASE_URL` is deliberately unset locally so the client uses the `/sb` proxy                                                                                                                                                    |

## Subdirectories

| Directory | Purpose                                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------------------------- |
| `build/`  | Vite build helpers: port resolution and the service worker plugin (see `build/AGENTS.md`)                        |
| `public/` | Static assets copied verbatim to the site root: manifest, favicon, icons, font licenses (see `public/AGENTS.md`) |
| `src/`    | Application source (see `src/AGENTS.md`)                                                                         |

## For AI Agents

### Working In This Directory

- Run the dev server with `make dev` (`npx vite web --host`), never `npm run` variants. `make build-local` builds in `development` mode for the PWA e2e suite and `make preview` serves it.
- `web/dist/` is generated. The service worker `sw.js` only exists after `vite build`; the dev server registers no worker (`registerServiceWorker` returns unless `import.meta.env.PROD`).
- `__CHANGELOG__` and `__APP_BUILD__` are declared in `src/vite-env.d.ts`. If you add another build-time constant, declare it there and in `vite.config.ts` together. The app version is the newest `changelog.yaml` entry (`APP_VERSION` in `src/features/whats-new/changelog-data.ts`); there is no other version constant.
- `vite.config.ts` reads `changelog.yaml` once at startup, so restart `make dev` after editing it. ESLint bans the `__CHANGELOG__` global everywhere except `src/features/whats-new/changelog-data.ts`; import `CHANGELOG` from there.
- The `@domain` alias is also configured in `tsconfig.json` and `vitest.config.ts`. Change all three together.
- Never commit a hosted Supabase URL or key. Production values come from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` at build time (see `../docs/production-auth.md`).

### Testing Requirements

Config files here are exercised indirectly: `make e2e` (dev server through `../playwright.config.ts`) and `make e2e-pwa` (preview build through `../playwright.pwa.config.ts`) both import `build/ports.ts`. There is no unit test for `vite.config.ts`. A change that affects the production build output belongs in `../e2e/pwa/*.spec.ts`. The local stack is required.

### Common Patterns

- Ports come from `GAINSCAPE_WEB_PORT` and `GAINSCAPE_PREVIEW_PORT` so a second worktree stack can run side by side.
- Files imported by Node (`vite.config.ts`, `build/*.ts`) use `.ts` extensions and `import.meta.dirname`.

## Dependencies

### Internal

- `../supabase/functions/_shared/domain/` through the `@domain` alias
- `build/` and `src/pwa/shell-rules.ts` (the plugin imports shell rules)
- `../Makefile` targets `dev`, `build-local`, `preview`, `sw-kill-switch`

### External

- `vite`, `@vitejs/plugin-react`, `@vitejs/plugin-basic-ssl`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
