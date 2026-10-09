# AGENTS.md: web/ (React PWA)

Also read the root [`AGENTS.md`](../AGENTS.md). Design: design doc section 5.

## Commands

Run in `web/`, after `nvm use`.

| Task                                               | Command                                   |
| -------------------------------------------------- | ----------------------------------------- |
| Dev server (proxies `/api` to the Go API on :8080) | `npm run dev`                             |
| Lint (type-aware; any warning fails)               | `npm run lint`                            |
| Format / check format                              | `npm run format` / `npm run format:check` |
| Type check                                         | `npm run typecheck`                       |
| Unit tests (Jest)                                  | `npm test`                                |
| Production build                                   | `npm run build`                           |
| Storybook (component catalogue) on :6006           | `npm run storybook`                       |
| Storybook build (CI checks it)                     | `npm run build-storybook`                 |

## Rules (enforced)

The linter and compiler enforce these. Settings: `.oxlintrc.json`, `tsconfig.app.json`, `.prettierrc.json`.

- Named exports only, no default exports (config files are the exception).
- No barrel files (`index.ts` that only re-exports).
- No `any`.
- Hooks: rules-of-hooks and exhaustive-deps are errors.
- Accessibility (`jsx-a11y`): `alt` text, keyboard support for clickable elements, valid ARIA.
- No floating promises: `await` them or handle them.
- `list[0]` is `T | undefined` (`noUncheckedIndexedAccess`). Handle the `undefined`.
- Max file length: see `max-lines` in `.oxlintrc.json`.
- The UI rules marked `enforced` below (`scripts/check-ui-rules.mjs`, part of `npm run lint`).

## Effects (`useEffect`)

`useEffect` is only for syncing with something **outside React**: browser APIs (`online`/`offline` events), the service worker, Firebase listeners, timers.

Enforced by lint (errors):

- `set-state-in-effect`: no `setState` directly in an effect body.
- `exhaustive-deps`: every value the effect uses is in its dependency array.

Not caught by lint, so check by hand (and in review):

| Instead of an effect that...      | Do this                                      |
| --------------------------------- | -------------------------------------------- |
| computes a value from props/state | compute it during render (`useMemo` if slow) |
| reacts to a user action           | put the code in the event handler            |
| fetches data                      | TanStack Query (from M2)                     |
| resets state when an id changes   | give the component `key={id}`                |
| keeps two pieces of state in sync | store one, compute the other                 |

Background: [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect).

## UI rules

Design source: the **RUD Design Inventory** (https://claude.ai/artifact/Lyv8dnTRRDg6hwa3jxP2ws): screens, states, tokens, components, copy, icons, motion, accessibility.
If the Inventory and the code disagree, **ask**; don't guess.

Each rule has an `id`. `enforced` rules fail `npm run lint` (`scripts/check-ui-rules.mjs`); `advisory` rules are checked in review (the `ui-reviewer` agent and the owner).

```yaml
- id: ui-tokens-only
  status: enforced
  applies_to: 'src/**/*.{ts,tsx,css}, except src/index.css'
  check: 'No raw colours (hex, rgb(), hsl(), oklch()) and no Tailwind palette colours (bg-red-500).
    Use the tokens from src/index.css: bg-bg2, text-fg2, text-accent, bg-(image:--grad-shell-brand) ...
    New colour? Add it to the Inventory first, then to src/index.css.'

- id: ui-no-transition-all
  status: enforced
  applies_to: 'src/**/*.{tsx,css}'
  check: 'No transition-all. Name the properties (transition-opacity, transition-colors).'

- id: ui-icons-lucide
  status: enforced
  applies_to: 'src/**/*.tsx'
  check: 'Icons come from lucide-react, imported one by one. No inline <svg>.'

- id: ui-component-story-and-test
  status: enforced
  applies_to: 'src/components/ui/*.tsx'
  check: 'Every shared component has Thing.stories.tsx (all variants, light + dark) and Thing.test.tsx.'

- id: ui-shared-components
  status: advisory
  applies_to: 'src/features/**/*.tsx'
  check:
    "Use components from src/components/ui (TopBar, Button, Spinner ...). Don't restyle a native
    <button> by hand. A UI piece used on 2+ screens moves to src/components/ui."

- id: ui-match-inventory
  status: advisory
  applies_to: 'src/**/*.tsx'
  check: "Sizes, spacing, radius and states follow the Inventory's component card. A component's doc
    comment names its card (e.g. 'Design Inventory → Components → Buttons')."

- id: ui-copy-from-inventory
  status: advisory
  applies_to: 'src/**/*.tsx'
  check: "User-facing text comes from the Inventory's UX Copy panel (tone: dry, funny, short).
    New text? Add it to the Inventory too."

- id: ui-touch-targets
  status: advisory
  applies_to: 'src/**/*.tsx'
  check: 'Anything tappable is at least 44×44 px (Inventory → Accessibility).'

- id: ui-accessible-names
  status: advisory
  applies_to: 'src/**/*.tsx'
  check: 'Icon-only buttons and links have aria-label. Decorative icons have aria-hidden. Focus is
    visible (focus-visible:outline-accent).'

- id: ui-both-themes
  status: advisory
  applies_to: 'src/**/*.{tsx,css}'
  check:
    'Everything works in light and dark (check the Storybook theme toggle). Status, nag and error
    tokens stay the same in both themes on purpose (Inventory rule: hue carries meaning).'

- id: ui-reduced-motion
  status: advisory
  applies_to: 'src/**/*.{tsx,css}'
  check: 'Animations stop or shrink under prefers-reduced-motion (Tailwind motion-reduce:).'

- id: ui-safe-areas
  status: advisory
  applies_to: 'src/**/*.tsx'
  check:
    "Sticky or fixed bars add the phone's safe area (env(safe-area-inset-top/bottom)), so content
    clears the notch and home bar."

- id: ui-mobile-inputs
  status: advisory
  applies_to: 'src/**/*.tsx'
  check: 'Text inputs use at least 16px font (smaller makes iOS zoom in on focus).'
```

## Conventions (design doc 5.4)

- Folders: `src/app/` (shell, router), `src/lib/` (shared helpers, API client), `src/features/<feature>/` (pages and components per feature), `src/components/ui/` (our own components, built on Base UI).
- Tests sit next to the code: `Thing.test.tsx`.
- Server data: TanStack Query (from M2). API calls: generated by orval from `swagger.json` (from M2). Until then, plain `fetch` in `src/lib/api/`.
- UI components: **Base UI** (`@base-ui/react`) for behaviour and accessibility (added with the first component that needs it, e.g. a dialog), styled with **Tailwind 4**. We build our own components in `src/components/ui/`. **No shadcn.**
- Design tokens: `src/index.css` (copied from the Inventory). Font: Inter, self-hosted (`@fontsource-variable/inter`). Icons: `lucide-react`.
- Routing: **TanStack Router**, routes defined in code in `src/app/router.tsx` (no generated route files). Links are type-checked: `<Link to="/r/$id" params={{ id }}>`.
- Components with `<Link>` need a router in tests and stories: wrap them in `WithRouter` (`src/test-utils/withRouter.tsx`).
- The app is mobile-first and will support light and dark mode (`index.html`).

## Never

- Never put secrets in frontend code. Everything here is public in the browser. Firebase web config is public by design.
- Never call the Cloud Run URL directly. Always use `/api/...` (same origin through Firebase Hosting).
- Never add `user-scalable=no` or `maximum-scale` (blocks zoom).
