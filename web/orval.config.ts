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
})
