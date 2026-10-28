# Design Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-28

## Purpose

`DesignScreen.tsx`: the `/design` gallery of tokens and shared controls described in `../../../../docs/design-system.md`. It exists only in DEV builds.

## Rules and gotchas

- `App.tsx` imports it lazily inside an `import.meta.env.DEV` branch, so Vite drops it from production. Keep the route above the catch-all.
- It renders real components with sample props and fetches nothing. Add a shared control here when you add one to `../../components/` or a `.button` modifier.
- Token lists come from `tokens.css?raw`, so a new token shows up without an edit here.

## Testing

- `e2e/a11y.spec.ts` scans it with axe and the 44px check; `e2e/pages/dev-only.spec.ts` proves the production build redirects `/design` to `/`.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
