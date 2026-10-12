/**
 * Small fetch wrapper for the RUD API until orval generates the API code (M2).
 * - Calls /api/v1/... on the same origin (Firebase Hosting forwards it to Cloud Run).
 * - Sends the sign-in token as "Authorization: Bearer <token>".
 * - Turns the API's error shape {"error":{"code","message"}} into an ApiError.
 * - Checks the shape of what comes back, so a broken answer is an error, not a crash later.
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

/** The part of fetch's Response this file uses. */
export type HttpResponse = { ok: boolean; status: number; json(): Promise<unknown> }
export type Http = (url: string, init: RequestInit) => Promise<HttpResponse>

let http: Http = (url, init) => fetch(url, init)

/** Tests swap in a fake server (the test browser has no fetch). */
export function setHttp(next: Http) {
  http = next
}

type Options = {
  method?: 'GET' | 'PATCH'
  body?: unknown
  token?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function call(path: string, { method = 'GET', body, token }: Options = {}): Promise<unknown> {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res: HttpResponse
  try {
    res = await http(`/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'network', "Can't reach the server. Check your connection.")
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const err = isRecord(data) && isRecord(data.error) ? data.error : {}
    throw new ApiError(
      res.status,
      typeof err.code === 'string' ? err.code : `http_${res.status}`,
      typeof err.message === 'string' ? err.message : `Request failed (${res.status})`,
    )
  }
  return data
}

/** The User schema in api/swagger.json. */
export type Me = {
  id: string
  email: string
  timezone: string
  defaultTimeOfDay: string
  defaultNagIntervalMin: number
}

function toMe(data: unknown): Me {
  if (
    isRecord(data) &&
    typeof data.id === 'string' &&
    typeof data.email === 'string' &&
    typeof data.timezone === 'string' &&
    typeof data.defaultTimeOfDay === 'string' &&
    typeof data.defaultNagIntervalMin === 'number'
  ) {
    return {
      id: data.id,
      email: data.email,
      timezone: data.timezone,
      defaultTimeOfDay: data.defaultTimeOfDay,
      defaultNagIntervalMin: data.defaultNagIntervalMin,
    }
  }
  throw new ApiError(200, 'bad_response', 'Unexpected answer from the server.')
}

/** GET /api/v1/me: the signed-in user (created on the first visit). */
export async function getMe(token: string | null): Promise<Me> {
  return toMe(await call('/me', { token }))
}

/** PATCH /api/v1/me: change settings; fields left out stay as they are. */
export async function updateMe(
  changes: Partial<Pick<Me, 'timezone' | 'defaultTimeOfDay' | 'defaultNagIntervalMin'>>,
  token: string | null,
): Promise<Me> {
  return toMe(await call('/me', { method: 'PATCH', body: changes, token }))
}
