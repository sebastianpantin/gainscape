# Design system

The rules every screen follows, with the reason for each. Tooling enforces the ones marked **(guard)**; break one only by changing the guard and this page in the same pull request. The dev-only gallery at `/design` (`web/src/features/design/DesignScreen.tsx`, run `make dev`) renders the tokens and shared controls, and the every-screen axe scan in `e2e/a11y.spec.ts` covers it.

## Tokens

- Colours, spacing and type sizes are CSS custom properties in `web/src/styles/tokens.css`. Area stylesheets use `var(--…)` only. **(guard: `tests/web/css-rules.test.ts`)** Why: one palette keeps contrast checkable and lets a colour change land in one place.
- Roles: `--color-background`/`--color-panel`/`--color-well`/`--color-chrome` are surfaces; `--color-text`, `-muted`, `-faint` are text; `--color-accent` is the one action colour; `--color-xp` means progress or done; `--color-danger` means loss; `--color-focus` is only the focus ring **(guard)**, so a "today" marker or a count never looks focused (use `--color-accent-light`); `--color-scrim` is every dialog backdrop; `--color-bevel-light` is the highlight edge on a coloured swatch.
- Text tokens pass WCAG on every surface, and control glyphs (icons inside a control, such as the unticked Done check) pass 3:1 on the control surfaces. **(guard: `tests/web/contrast.test.ts`)** `--color-panel-border` is a border colour, never a glyph, because it fails 3:1 on `--color-well`.
- Type scale: `--font-size-2xs` (12px, decorative captions only), `xs` (13px, the floor for data text and every button), `md`, `lg`, `xl`, `2xl`, `3xl`. Adjacent steps are at least 8% apart so two sizes never look accidentally alike. **(guard)** Display numbers use the short list of one-off sizes in `css-rules.test.ts`; nothing renders below 12px, chart labels included.
- Spacing: `--space-0-5` (2px) to `--space-6` (24px). TSX in `web/src/features` never passes a raw pixel number in `style`. **(guard: ESLint `no-restricted-syntax`)** Why: one rhythm across screens, and a stylesheet change reaches every screen.
- The page declares `color-scheme: dark` on `:root` and in `<meta name="color-scheme">` **(guard: unit and e2e)**, so native controls, scrollbars and autofill match the dark palette.

## Buttons

- Every button is `.button` plus at most one variant: `primary` (the main action), `danger` (destructive confirm), `outline`, `dashed` (add something), `link` (text action), `icon` (square, needs `aria-label`), `big` (the Finish and Start bars), `toggle` (a sunken on/off control; pressed state from `aria-pressed`), `chip` (a radio option in a row of choices; checked state from `aria-checked`).
- State lives in ARIA attributes, not in extra classes, so the look and the accessibility tree cannot disagree.
- One disabled style: `opacity: 0.5` and `cursor: not-allowed` for `.button`, `.segment` and `.switch`.
- New bespoke bevelled controls count against a cap of 10 control bevel rules. **(guard)** Add a modifier to `.button` instead.
- One primary per screen. A second important action is a default `.button`.
- Visible labels stay short ("Edit", "Remove"); a repeated action in a list gets a contextual `aria-label` ("Edit Upper / Lower") so screen reader users can tell rows apart.

## Screen states

- Loading: `ScreenSkeleton` for a whole screen, `ListSkeleton` inside a screen whose heading is already known. Never a bare "Loading…" paragraph.
- Load failure: `ScreenProblem` for a whole screen, `ProblemWithRetry` for a section. Both have "Try again".
- The `h1` renders in every state (loading, failed, empty, loaded), so route focus and the page title always find it.
- Empty: `EmptyState` with one next step.

## Destructive actions

- Reversible (remove a set, undo edits, remove a day): act at once and show an undo toast.
- Irreversible (delete a workout, remove a friend, delete the account): `ConfirmDialog`, with the danger button as the confirm.
- Never swap a button inline into a second "Are you sure?" button: it moves the target under the finger.
- After the action, focus moves to a sensible element (the list, the next row, the heading), never to `<body>`.

## Navigation

- A child screen's way back is the shared `BackLink`: `navigate(-1)` when the previous entry is inside the app, the parent route otherwise, so a deep link never loops back to itself.
- Screen titles come from `web/src/lib/platform/route-title-rules.ts`; a new route needs an entry there (unit test).

## Forms

- A field with a problem sets `aria-invalid` and links its `FieldProblem` text with `aria-describedby`.
- Constraints are stated before the user types ("At least 12 characters"), not only after a failed submit.
- Inputs are 16px (`--font-size-md`) so iOS does not zoom on focus.

## Touch

- Every interactive element is at least 44 by 44 px, checked on every screen in the axe loop against every control (`EVERY_CONTROL`). **(guard: `e2e/support/a11y.ts`)** The only exemption is `.visually-hidden` content, which is not a hit target. A text link inside a sentence gets `.tap-link`.
- Fixed-size controls in a flex row get `flex-shrink: 0`, so a long neighbour cannot squeeze them under 44 px.
- Hover styles sit inside `@media (hover: hover)` **(guard)**, so a tap on a phone never leaves a control looking hovered.
- Every `outline: none` has a `:focus-visible` ring for the same element, and `summary` shares the global ring. **(guard)**
- Full-width fixed chrome (tab bar, toast, reveal Skip) keeps clear of `env(safe-area-inset-*)` on the sides as well as the bottom. **(guard)**

## Vocabulary

- One term per concept, the same in headings, buttons, toasts and `route-title-rules.ts`: a workout, a set, effort, Finish, Custom exercises, Program.
- Game terms the user may not know get a `TermHelp` button from the glossary (`web/src/lib/ui/glossary.ts`).
