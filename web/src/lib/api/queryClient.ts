import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './mutator'

/**
 * The one cache for all server data (TanStack Query, design doc 5.4 and 5.5).
 * Refetch on window focus stays on: the data is fresh when you come back to the app.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Retry only what can fix itself (no connection, a server hiccup), at most twice.
        // A 4xx answer (not invited, not found, invalid) won't change by asking again.
        retry: (failures, error) =>
          failures < 2 && error instanceof ApiError && (error.status === 0 || error.status >= 500),
      },
    },
  })
}
