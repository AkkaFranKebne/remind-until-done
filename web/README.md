# RUD web app (React + Vite)

The frontend. Layout and plans: design doc section 5.

```
index.html            page shell: title, theme colour, viewport-fit=cover
vite.config.ts        dev server proxies /api to the Go API on :8080
firebase.json         Firebase Hosting: serves dist/, sends /api/** to Cloud Run
.firebaserc           Firebase project names: dev and prod
src/
  main.tsx            entry point
  app/App.tsx         the page (for now: logo + API status)
  app/ApiStatus.tsx   calls /api/v1/healthz and shows the result (temporary, M0)
  lib/api/health.ts   the fetch call
```

## Run locally
Needs Node 22.12+ (`nvm use` picks the version from `.nvmrc`).
```
nvm use
npm install
npm run dev          # http://localhost:5173
```
Start the API too (`make run` in `api/`), or the page shows "API unreachable".

## Scripts
| Script | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type check, then production build into `dist/` |
| `npm run typecheck` | TypeScript check only |
| `npm run lint` | oxlint |
| `npm test` | Jest unit tests |
