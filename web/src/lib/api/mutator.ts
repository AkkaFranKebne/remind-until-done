/**
 * The one function every API call goes through (orval's "mutator", design doc 5.5).
 * The generated hooks in ./generated call it; nothing else calls fetch for the API.
 * - Sends the sign-in token as "Authorization: Bearer <token>".
 * - Turns the API's error shape {"error":{"code","message"}} into an ApiError.
 * - A request that never reached the server becomes ApiError status 0, code "network".
 */

export class ApiError extends Error {
  /** HTTP status; 0 when the request never reached the server (offline, DNS ...). */
  readonly status: number
  /** The API's error code, e.g. "unauthorized", "not_invited", "validation_failed". */
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/** Where the token comes from. AuthProvider sets it to the sign-in client's getToken. */
let tokenSource: () => Promise<string | null> = () => Promise.resolve(null)

export function setTokenSource(next: () => Promise<string | null>) {
  tokenSource = next
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export async function apiFetch<T>(url: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers)
  const token = await tokenSource()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let res: Response
  try {
    res = await fetch(url, { ...init, headers })
  } catch {
    throw new ApiError(0, 'network', "Can't reach the server. Check your connection.")
  }

  if (!res.ok) throw await toApiError(res)
  // An empty body (204 No Content, e.g. DELETE) gives null. Otherwise the shape is
  // the contract's (swagger.json): contract tests on both sides keep the API and
  // swagger.json in step, so the generated type T is trusted here.
  const text = await res.text()
  return JSON.parse(text || 'null')
}

async function toApiError(res: Response): Promise<ApiError> {
  const data: unknown = await res.json().catch(() => null)
  const err = isRecord(data) && isRecord(data.error) ? data.error : {}
  return new ApiError(
    res.status,
    typeof err.code === 'string' ? err.code : `http_${res.status}`,
    typeof err.message === 'string' ? err.message : `Request failed (${res.status})`,
  )
}

/** The error type orval gives the generated hooks: whatever the endpoint, it's an ApiError. */
export type ErrorType<_ServerBody> = ApiError
