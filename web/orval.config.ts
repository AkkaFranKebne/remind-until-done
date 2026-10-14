import { defineConfig } from 'orval'

/**
 * orval reads the API contract (api/swagger.json) and writes typed TanStack Query hooks
 * and MSW mocks into src/lib/api/generated/ (never edit those files: regenerate).
 * Run `npm run api:generate` after changing swagger.json. CI fails if the output differs.
 */
export default defineConfig({
  rud: {
    input: { target: '../api/swagger.json' },
    output: {
      mode: 'tags-split', // one folder per swagger tag: user/, reminders/, devices/ ...
      target: 'src/lib/api/generated/endpoints.ts',
      schemas: 'src/lib/api/generated/model',
      client: 'react-query',
      httpClient: 'fetch',
      baseUrl: '/api/v1', // same origin: Firebase Hosting forwards /api/** to Cloud Run
      clean: true,
      formatter: 'prettier',
      mock: { generators: [{ type: 'msw', delay: false }], indexMockFiles: true },
      override: {
        // Every call goes through our fetch wrapper (sign-in token, typed errors).
        mutator: { path: 'src/lib/api/mutator.ts', name: 'apiFetch' },
        fetch: { includeHttpResponseReturnType: false },
      },
    },
  },
  // The same contract as Zod schemas, mainly for the limits (title max 200 …) the forms use, so
  // they come from swagger.json instead of being typed twice. Runs after `rud`, whose `clean`
  // empties the whole generated/ folder first.
  rudZod: {
    input: { target: '../api/swagger.json' },
    output: {
      mode: 'tags-split',
      target: 'src/lib/api/generated/zod/endpoints.ts',
      client: 'zod',
      formatter: 'prettier',
      // Zod Mini with pure annotations: the build drops every schema the app doesn't use, so
      // importing the limits costs almost nothing (regular Zod kept all of them: +9 kB).
      override: { zod: { variant: 'mini', version: 4 } },
    },
  },
})
