# src

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

All application source for the React PWA. `main.tsx` boots the app, `App.tsx` owns auth gating and routing, and the subdirectories split by concern: pure logic and Supabase clients (`lib/`), the offline draft engine (`offline/`), one folder per screen group (`features/`), shared UI (`components/`), styling (`styles/`), the PWA runtime (`pwa/`) and the service worker entries (`sw/`). Each has its own `AGENTS.md`.

## Map

- `main.tsx`: the entry.
- `App.tsx`: auth callback, signed-out and loading states, providers, the tab bar (`TABS`) and every route. Routes are declared only here.
- `vite-env.d.ts`: `import.meta.env` and the build-time globals `__APP_BUILD__` and `__CHANGELOG__`.

## Rules and gotchas

- Import order in `main.tsx` matters: `zod-config.ts` first (zod's JIT probe would break the Pages CSP), then `pwa/install.ts` (so `beforeinstallprompt` is never missed), then fonts and styles.
- Add a screen in `App.tsx` with `lazyScreen(() => import('./features/...'), 'NamedExport')`; a tab-level screen also goes in `TABS` with an icon from `components/Icon.tsx`. Every screen except `WorkoutScreen` (the landing route) is a lazy chunk under one `Suspense` with a `ScreenSkeleton` fallback inside `ScreenErrorBoundary`; all chunks preload a second after sign-in. Unknown paths redirect to `/`. Also add the path to `SCREEN_TITLES` in `lib/route-title-rules.ts`: an unlisted path silently gets the title `Gainscape`, and no test checks the two tables against each other.
- `RouteView` keys a div by pathname for a 180 ms opacity-only fade. Never use a transform there: it would become the containing block of `position: fixed` children.
- `RouteFocusAndTitle` sets the page title and focuses the new screen's `h1` on each route change.
- Screens take `userId` as a prop; `WorkoutScreen` is keyed on it and `PreferencesProvider` by user id so state resets on account switch.
- Read the changelog through `features/whats-new/changelog-data.ts`, never the `__CHANGELOG__` global (ESLint bans it).
- Keep components thin: decisions go in `lib/*-rules.ts`, `offline/draft-format.ts` or `pwa/*` pure modules, tested in `tests/web/`.
- Use `@domain/*` for game rules; never reimplement XP, levels or loot in the web layer. The server is authoritative.
- Named exports only, one component per file named like the file. External stores use `useSyncExternalStore`. Wrap browser storage access in try/catch and degrade silently.

## Testing

- Pure logic: `tests/web/` (`make test-web`, no stack). Screens and flows: `e2e/*.spec.ts` (`make e2e`, stack).
- Routing, tab bar and auth gating in `App.tsx` have no unit test; add the failing case to `e2e/auth.spec.ts` or `e2e/a11y.spec.ts`.
- Font imports in `main.tsx` are checked by `tests/web/licenses.test.ts`.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
