# src

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-09

## Purpose

All application source for the React PWA. `main.tsx` boots the app, `App.tsx` owns auth gating and routing, and the subdirectories split by concern: pure logic and Supabase clients (`lib/`), the offline draft engine (`offline/`), one folder per screen group (`features/`), shared UI (`components/`), styling (`styles/`), PWA runtime (`pwa/`) and the service worker entries (`sw/`).

## Key Files

| File            | Description                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.tsx`      | Entry. Imports `zod-config.ts` first (zod's JIT probe would break the Pages CSP), then `pwa/install.ts` (so `beforeinstallprompt` is never missed), the `@fontsource` fonts, `tokens.css` and `app.css`, calls `registerServiceWorker()`, and renders `<App />` in `StrictMode`                                                                                                                             |
| `App.tsx`       | `App` renders `UpdateBanner`, `OfflineBanner` and `Screens`. `Screens` handles the auth callback (`parseAuthCallback`), loading and signed-out states, then wraps a `BrowserRouter` in `PreferencesProvider` (keyed by user id) with the bottom `TABS` bar and every route (`/profile/settings/whats-new` renders `WhatsNewScreen`) and the `WhatsNewSheet` below the routes. Unknown paths redirect to `/` |
| `vite-env.d.ts` | Types `import.meta.env` (`VITE_SUPABASE_URL` optional, `VITE_SUPABASE_PUBLISHABLE_KEY`) and declares the build-time globals `__APP_BUILD__` (git short hash plus date, or `dev`) and `__CHANGELOG__` (the bundled releases); read the changelog through `features/whats-new/changelog-data.ts`, never the global                                                                                            |

## Subdirectories

| Directory     | Purpose                                                                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/`        | Supabase client, edge function client, data fetchers and the pure `*-rules.ts` modules (see `lib/AGENTS.md`)                                               |
| `offline/`    | Local workout drafts, draft store, finish lock, retries and sync (see `offline/AGENTS.md`)                                                                 |
| `features/`   | Screens grouped by area: auth, collection, exercises, friends, history, profile, programs, skills, summary, what's new, workout (see `features/AGENTS.md`) |
| `components/` | Shared presentational components and pixel sprites (see `components/AGENTS.md`)                                                                            |
| `styles/`     | Design tokens and the single global stylesheet (see `styles/AGENTS.md`)                                                                                    |
| `pwa/`        | Install, update and offline runtime plus the shared shell rules (see `pwa/AGENTS.md`)                                                                      |
| `sw/`         | Service worker and kill switch entry points, compiled by `web/build/` (see `sw/AGENTS.md`)                                                                 |

## For AI Agents

### Working In This Directory

- Keep components thin. Put decisions in `lib/*-rules.ts`, `offline/draft-format.ts` or `pwa/*` pure modules, and test them under `tests/web/`.
- Routes are declared only in `App.tsx`. Add the screen there and, for a tab-level screen, to `TABS` with an icon from `components/Icon.tsx`.
- Screens take `userId` as a prop; `WorkoutScreen` is keyed on it so state resets on account switch.
- Use `@domain/*` imports for game rules. Never reimplement XP, levels or loot logic in the web layer; the server is authoritative.
- No comments, `.ts`/`.tsx` extensions in imports, inline `type` imports.
- `.omc/` folders under `src/` are tool state and ignored.

### Testing Requirements

Pure logic here is covered by `tests/web/` (`make test-web`, no stack). Screens and flows are covered by `e2e/*.spec.ts` (`make e2e`, needs the stack). Routing, tab bar and auth-gating changes in `App.tsx` have no unit test; add the failing case to `e2e/auth.spec.ts` or `e2e/a11y.spec.ts`. Font imports in `main.tsx` are checked by `tests/web/licenses.test.ts`.

### Common Patterns

- Named exports only; one component per file named like the file.
- External-store subscriptions use `useSyncExternalStore` (install state, update flow, offline banner).
- Browser storage access is wrapped in try/catch and degrades silently.

## Dependencies

### Internal

- `@domain/*` (`supabase/functions/_shared/domain/`), all subdirectories above

### External

- `react`, `react-dom`, `react-router-dom`, `@supabase/supabase-js`, `@fontsource/ibm-plex-mono`, `@fontsource/pixelify-sans`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
