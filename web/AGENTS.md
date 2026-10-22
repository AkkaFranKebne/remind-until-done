# AGENTS.md: web/ (React PWA)

Also read the root [`AGENTS.md`](../AGENTS.md). Design: design doc section 5.

## Commands

Run in `web/`, after `nvm use`.

| Task                                                                                                                                                                                 | Command                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| Dev server on **https**://localhost:5173 (proxies `/api` to the Go API on :8080; first visit: accept the certificate warning)                                                        | `npm run dev`                             |
| Frontend without the API, database or Firebase on http://localhost:5173: a fake API in the browser (MSW, `src/mocks/devApi.ts`) with one reminder in every state, and a fake sign-in | `npm run dev:mock`                        |
| Lint (type-aware; any warning fails)                                                                                                                                                 | `npm run lint`                            |
| Format / check format                                                                                                                                                                | `npm run format` / `npm run format:check` |
| Type check                                                                                                                                                                           | `npm run typecheck`                       |
| Unit tests (Jest)                                                                                                                                                                    | `npm test`                                |
| Production build                                                                                                                                                                     | `npm run build`                           |
| The build has no test-only or mock code (after `npm run build`; CI runs it)                                                                                                          | `npm run check:bundle`                    |
| Storybook (component catalogue) on localhost:6006, also the agents' `storybook` MCP server (`/mcp`)                                                                                  | `npm run storybook`                       |
| Storybook build (CI checks it)                                                                                                                                                       | `npm run build-storybook`                 |
| Regenerate the API code after `api/swagger.json` changes (CI checks it)                                                                                                              | `npm run api:generate`                    |

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
| fetches data                      | TanStack Query (see Conventions)             |
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
  check:
    "No raw colours (hex, rgb(), hsl(), oklch(), text-white, bg-red-500). Use the colour tokens from
    src/index.css: bg-bg2, text-fg2, text-accent, bg-(image:--grad-shell-brand) ...
    No pixel sizes (text-[13px], rounded-[10px]). Text sizes come from the type scale only:
    text-xs 11 · text-sm 13 · text-base 15 · text-input 16 (typed text in fields only) · text-lg 18 ·
    text-xl 22 · text-countdown 40 (the reminder page's countdown) · text-display 72 (in rem).
    Radii: rounded-sm 6 · rounded-md 12 · rounded-lg 20 (and rounded-full).
    No one-off values in [ ] at all (border-[1.5px], tracking-[-3px], h-[844px]); only env(...)
    for safe areas. Named extras: border-strong (1.5px), animate-spin-fast (0.7s), sheet-slide and
    backdrop-fade (every bottom sheet and its backdrop), sheet-tall (the full-height form sheet with snap
    points), bg-shimmer + animate-shimmer (Skeleton), animate-nag-pulse (the nag dot),
    tile-ring-overdue and tile-ring-picked (status tiles), shadow-fab (the + button's glow),
    shadow-row-1 … shadow-row-5 (reminder rows, deeper down the stack). Spacing uses
    Tailwind's 4px scale, whole or half steps (gap-2, size-4.5); letter spacing too (tracking-tight).
    Tailwind's own text sizes and radii (text-2xl, rounded-xl) are removed. New value? Add it to
    the Inventory first, then to src/index.css."

- id: ui-no-transition-all
  status: enforced
  applies_to: 'src/**/*.{tsx,css}'
  check: 'No transition-all. Name the properties (transition-opacity, transition-colors).'

- id: ui-icons-lucide
  status: enforced
  applies_to: 'src/**/*.tsx'
  check: 'Icons come from lucide-react, imported one by one. No inline <svg>. One exception:
    third-party brand marks (the Google "G") are image files in public/, shown with <img alt="">
    (Inventory → Icons → Brand logos).'

- id: ui-base-ui-first
  status: enforced (raw elements) + advisory (choice of component)
  applies_to: 'src/**/*.tsx'
  check: 'Interactive UI is built on Base UI (@base-ui/react) whenever Base UI has the component:
    Button, Dialog, Drawer, Menu, Select, Field/Input, Checkbox, Switch, Tabs, Toast, Tooltip ...
    We add only the styling (tokens) and our API on top. Enforced: no raw <button>, <input>,
    <select>, <textarea> or <dialog> in src/ (use our ui components or Base UI). The one exception: a
    raw element given to a Base UI part's render prop, e.g. Field.Control render={<textarea />}.
    Exception: navigation is a real link (TanStack <Link>, ButtonLink, IconLink), never a Base UI
    Button, so screen readers say "link" and open-in-new-tab works. Hand-build behaviour only when
    Base UI has nothing for it, and say why in the doc comment.'

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

- id: ui-text-contrast
  status: advisory
  applies_to: 'src/**/*.tsx'
  check: 'Small text (text-xs, text-sm) uses text-fg2 or stronger. text-fg3 only for large or
    non-essential text: it is about 3.4:1 on bg, below WCAG AA 4.5:1 (Inventory → Tokens).'

- id: ui-both-themes
  status: advisory
  applies_to: 'src/**/*.{tsx,css}'
  check:
    "Everything works in light and dark (check the Storybook theme toggle). Status and nag colours
    keep their hue in both themes (hue carries meaning). On the reminders list and the reminder page, dark mode flips the
    lightness: dark tints of the same hue with light text in that hue (index.css, dark blocks).
    Filled primary buttons use accent-solid + on-solid (same in both themes: white on the dark-mode
    accent is unreadable); the + button uses fab. Text on the list gradient uses on-grad /
    on-grad-fg2 (they have dark values, like the gradient). TopBar has no background of its own; pass
    the screen's tone (plain, brand, or the reminder's state: waiting … done) to colour its icon,
    never a raw colour."

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
  check: 'Text inputs use text-input (16px, only for typed text). Smaller makes iOS zoom in on focus.
    Never fight the zoom with maximum-scale or user-scalable=no (see Never).'
```

## Conventions (design doc 5.4)

- Folders: `src/app/` (shell, router), `src/lib/` (shared helpers, API client), `src/features/<feature>/` (pages and components per feature), `src/components/ui/` (our own components, built on Base UI).
- Tests sit next to the code: `Thing.test.tsx`.
- Server data: **TanStack Query**, one cache (`src/lib/api/queryClient.ts`). API calls: **orval** reads `api/swagger.json` (`orval.config.ts`) and generates typed hooks (`useGetMe`, `useListReminders` ...), MSW mocks and Zod schemas (`generated/zod/`, Zod Mini so unused ones drop out of the build) into `src/lib/api/generated/`. Form limits come from the generated constants (`createReminderBodyTitleMax` ...), never typed twice. Use a generated hook, or `queryOptions` around a generated function when a query needs more (like `useMe`, which adds the time zone PATCH and shares orval's key for GET /me). Never write `fetch` for the API, and never edit `generated/` (it's left out of lint; CI regenerates it and fails on any difference). Contract changed? Edit `api/swagger.json`, then `npm run api:generate`.
- Every generated call goes through `src/lib/api/mutator.ts` (`apiFetch`): it adds the sign-in token and turns error answers into `ApiError` (`status`, `code`; status 0 = no connection). It doesn't check the shape of answers: the contract tests on both sides (`api/.../router_contract_test.go`) keep the API and `swagger.json` in step.
- UI components: built on **Base UI** (`@base-ui/react`) for behaviour and accessibility (rule `ui-base-ui-first`), styled with **Tailwind 4** and our tokens. They live in `src/components/ui/`: `Button`/`ButtonLink`, `IconButton`/`IconLink`, `TopBar`, `Spinner`, `Wordmark`, `ConfirmSheet`, `CenteredScreen` (Login, Splash, 404, Offline, iOS gate), `PageHeader` (‹ Back + title), `Sheet` (every bottom sheet: card or full, optional snap points), `TextField` (input or textarea, error, counter), `ChipGroup` (pick-one pills on Radio Group), `StatusChip`, `StatusTiles` (the list filter, on Toggle Group), `Skeleton` (shimmering placeholder block, sized by className), `Fab`, `Toast` (`ToastProvider` wraps the app; show one with `useToast().success(...)` or `.error(...)`). **No shadcn.** Every signed-in page wraps itself in `AppScreen` (`src/app/`: TopBar + content on the page's own background and TopBar tone).
- Variants (size, tone, look) use **cva** (`class-variance-authority`): one `thingVariants = cva(base, { variants })`, and the prop types come from `VariantProps`. No hand-built `if`/`join(' ')` class strings, and no helper functions that pick a class (`brandText(tone)`): a class that depends on a prop or state is a cva variant (`compoundVariants` for combinations, `satisfies Record<Union, string>` so no value is forgotten).
- Combine classes with **`cn()`** (`src/lib/cn.ts`: clsx + tailwind-merge). A `className` passed from outside wins over the component's own class (`px-5` + `px-6` → `px-6`).
- Every custom utility in `src/index.css` (`text-*` sizes, `border-*` widths, `animate-*`) is registered in `src/lib/cn.ts`, with a case in `cn.test.ts`. tailwind-merge only knows Tailwind's built-in names: unregistered, `cn('text-display', 'text-accent')` keeps only `text-accent`.
- Design tokens: `src/index.css` (copied from the Inventory). Font: Inter, self-hosted (`@fontsource-variable/inter`). Icons: `lucide-react`.
- Routing: **TanStack Router**, routes defined in code in `src/app/router.tsx` (no generated route files). Add a page with the `page(parent, path, Component)` helper. Links are type-checked: `<Link to="/r/$id" params={{ id }}>`; `router.test.tsx` guards this with a type-check test.
- Storybook listens on localhost only (`--host localhost`): never `--host 0.0.0.0` or `allowedHosts: true`, or the agents' `/mcp` endpoint is reachable from the network.
- Before building UI, ask the `storybook` MCP server what exists (`docs-list`, then `docs-show` for props). It only reports documented props: a prop that isn't there doesn't exist. Doc comments on components become its descriptions, so keep them accurate.
- Components with `<Link>` need a router in tests and stories: wrap them in `WithRouter` (`src/test-utils/withRouter.tsx`).
- Sign-in (`src/features/auth/`):
  - `useAuth()` gives `state` (`checking`, `signedOut`, `notInvited`, `signedIn`), `user` (Google name and email, or `null`), `signIn()` and `signOut()`. Pages that only need who is signed in use `user`, not `state`. `AuthProvider` sits above the router, inside `QueryClientProvider` (`App.tsx`).
  - `useMe()` gives the signed-in user's settings (GET /me). AuthProvider loads them into the query cache during sign-in, so signed-in pages have them at once. The same query sends the phone's time zone (PATCH /me) when it differs. Sign-out clears the whole cache.
  - The app talks to Firebase only through the `AuthClient` interface (`src/lib/authClient.ts`); the real one is `src/lib/firebase.ts`. Tests use `FakeAuthClient` (`src/test-utils/fakeAuthClient.ts`), never Firebase.
  - Route guards are TanStack Router's `beforeLoad` + `throw redirect(...)` (`src/app/router.tsx`, TanStack docs "Authenticated Routes"): the `app` route sends signed-out visitors to `/login?next=<page>` (after a tapped Sign out, to the plain `/login`: `byUser` in the auth state), `/login` sends signed-in ones on to `next`. The router's context holds the sign-in state; `AppRouter` (`src/app/AppRouter.tsx`) passes it in and re-runs the guards (`router.invalidate()`) when it changes. While Firebase is still checking, the guards wait and `RequireAuth` shows the splash. `safeNext()` only allows paths inside the app.
  - Firebase web settings come from Hosting's `/__/firebase/init.json` (one build for dev and prod). Locally Vite forwards `/__` to the dev site.
  - The dev server is https (Vite basic-ssl plugin): Firebase always returns from Google sign-in to `https://<host>`. Storybook runs its own server and stays on plain http.
- Forms: **React Hook Form + Zod** with the API's limits (design doc 5.5). One schema per form (e.g. `features/reminders/addReminderForm.ts`, used to create and to edit: `ReminderFormSheet` is the sheet, `AddReminderSheet` / `EditReminderSheet` do the saving), `zodResolver`, a `Controller` per field around our components, `useWatch` (not `watch`: the React compiler can't memoize it). Read form states you need (`isDirty`) while rendering, or React Hook Form doesn't track them. Errors inline, never a toast.
- Time: `src/lib/dates.ts` turns UTC instants into words in the phone's zone ("Tomorrow 09:00", "Done 3h ago", the countdowns "2d 04:00" and "00:42:17"). Components that show time-dependent text take "now" from `useNow()` (updates every minute; `useNow(1000)` for the reminder page's nag countdown), never `new Date()` during render. Character limits count like the API: `countCharacters()` (`src/lib/text.ts`).
- Row tints and status tiles have their own text tokens (`text-on-grad`, the `*-fg` status tokens), never `text-fg`/`text-fg2`: each pair is set for both themes in `index.css` (dark mode: dark tint, light text of the same hue).
- Tests talk to a fake API: **MSW** (`src/mocks/server.ts`, started in `jest.setup.ts`) with orval's generated handlers. A request with no handler fails the test. Change one answer with `server.use(getGetMeMockHandler(...))` or `http.get('*/api/v1/...', ...)`. Page tests: `renderApp(path, client)` + `mockMe()` (`src/test-utils/renderApp.tsx`), `aReminder()` + `mockReminders()` (`src/test-utils/reminders.ts`); components with hooks: wrap in `TestQueryProvider`. The fake API answers the reminders list with an empty list by default. Jest runs in UTC (`jest.config.js`).
- `npm run dev:mock` uses its own fake API, `src/mocks/devApi.ts`: in-memory data, the real API's rules (5 active, limits, a new time restarts the cycle, 404s). Changing an endpoint or its rules? Update it too (its test: `devApi.test.ts`). Mock code is loaded only when `import.meta.env.MODE === 'mock'` (`main.tsx`), so the build leaves it out; `npm run check:bundle` proves it. Mock mode runs on http, because Chrome refuses MSW's service worker on a site with a certificate warning. The worker stays registered for http://localhost:5173 afterwards (it passes requests through unless mock mode turns it on); remove it in DevTools → Application → Service workers if another project on that port acts oddly. Nothing sends pushes in mock mode: a nagging countdown stops at 00:00:00 until you reload.
- Navigating from code (`useNavigate`) happens in an event handler or an effect, never during render: TanStack's `<Navigate>` in a page that is being left can fire again and loop. Redirects that depend on state (who's signed in) belong in the route's `beforeLoad`.
- Use TanStack before hand-made state: a busy flag around an async job is `useMutation(...).isPending` (also for non-API jobs like sign-in and sign-out, which need `networkMode: 'always'`: the default pauses mutations while offline); "hide it until the server answers" is `useMutationState` (optimistic via the UI, as the swiped rows); state that should survive Back and reload goes in the address with `validateSearch` (the list's `?show=` tile); where you came from goes in history state, not the address (`state` on the `<Link>`, read with `useRouterState`, checked before use: the list tile for the reminder page's Back, `useListSearch.ts`).
- Hosting caching (`firebase.json`): every app file is `Cache-Control: no-cache`. The phone may keep files, but asks Firebase "still the same?" (a quick `304 Not Modified`) every time it opens the app, so a deploy shows up on the next open. The rule is a `regex` that skips `/api/...`: API answers are per user, and the API sets `no-store` on them itself. `deploy.yml` checks both headers after every deploy.
- Service worker (design doc 5.8, decision 41): one file, `src/sw.ts`, built by `vite-plugin-pwa` (`injectManifest`, classic script) into `/sw.js` and registered in `main.tsx` in production builds only (never on the dev server, where `dev:mock` runs MSW's worker). It caches the app shell (pages: network first, the cached `index.html` offline; `/api` and `/__` always network, except Firebase's public `/__/firebase/init.json`, which keeps its last copy for offline) and shows every push with the standard Push API. No Firebase inside the worker. The push-to-notification logic is pure and tested (`src/sw/notification.ts`); keep the worker itself thin. Type-checked with `tsconfig.sw.json` (WebWorker types). `/sw.js` must always exist: Hosting answers unknown paths with `index.html`, so a missing worker file leaves phones on the old worker forever. To remove the worker one day, ship a `sw.js` that unregisters itself. With `skipWaiting`, an old open tab loses its cached files: keep that in mind before adding lazy-loaded routes.
- Installing (`src/features/pwa/`, design doc §0 detection table, decision 42): `useInstall()` gives the device's state (`installed`, `installable`, `ios-browser`, `ios-too-old`, `just-installed`, `app-found`, `unavailable`), the iPhone/iPad info, and an `install` mutation that opens Chrome's dialog. Chrome's `beforeinstallprompt` can fire before React draws anything, so `installPrompt.ts` listens from the moment the app loads. Chrome stops offering once the app is installed, so a tab also asks `navigator.getInstalledRelatedApps()` (needs `related_applications` in `public/manifest.webmanifest`). Each entry names a site by its full address (`id` `https://<site>/`, `url` its manifest): a short `/` finds nothing (checked in Chrome 155). One build serves dev and prod, so both are listed; Chrome reads the first three entries and matches the one for the site it's on. A new site (a new environment or domain) must be added there, and only three fit. Local runs (`localhost`) aren't listed, so there the check never finds the app: test it on dev. The detection itself (user agent, standalone, the 16.4 rule) is pure and tested (`platform.ts`); iPads say "Macintosh", so a "Mac" with a touch screen is an iPad. jsdom counts as a desktop tab with no install offer: tests pick another device with `src/test-utils/device.ts` (`pretendInstalled()`, `pretendDisplayMode()` (also mid-test: desktop Chrome turns the installing tab into the app window), `pretendUserAgent()`, `offerInstall()`, `pretendAppFound()`, and `resetDevice()` in `afterEach`).
- Notifications (`src/features/notifications/`, design doc 5.7, decision 43): `useNotifications()` gives this device's state (`needs-install`, `unsupported`, `checking`, `off`, `blocked`, `lost`, `elsewhere`, `on`) and `enable()`. `enable()` asks for permission first, straight from the tap: iPhone Safari shows the prompt only then, so nothing may wait before it. Then the push token (`PushClient`, `src/lib/pushClient.ts`: Firebase in `lib/firebase.ts`, a fake in mock mode and tests), then `POST /devices`; the device id is kept in `localStorage` (`rud.deviceId`) to tell "this device" from "another device took over". `useRegisterOnStart()` (in `RequireAuth`) registers again once per app start, never when another device has the pushes (taking them back is a tap in Settings). Tests: `pretendNotifications()`, `pretendDeviceId()` in `src/test-utils/device.ts`, `FakePushClient` in `renderApp`.
- The Web Push (VAPID) public keys live in `lib/firebase.ts`, one per Firebase project; never generate new ones in the console (every phone would have to register again). `getToken()` needs our service worker, which exists only in builds: under `npm run dev` Enable fails with a toast; use `dev:mock` (a fake token) or a build.
- The app is mobile-first and supports light and dark mode (follows the phone's setting).

## Never

- Never put secrets in frontend code. Everything here is public in the browser. Firebase web config is public by design.
- Never call the Cloud Run URL directly. Always use `/api/...` (same origin through Firebase Hosting).
- Never add `user-scalable=no` or `maximum-scale` (blocks zoom).
