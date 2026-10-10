/** Shared API boundary; CSRF token stays in memory and never in localStorage. */
let csrfToken: string | null = null
let lastRequestId: string | null = null

export function setCsrfToken(token: string | null) {
  csrfToken = token
}

export function getLastRequestId() {
  return lastRequestId
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method || "GET").toUpperCase()
  const headers = new Headers(init.headers)
  if (csrfToken && !["GET", "HEAD", "OPTIONS"].includes(method)) headers.set("X-CSRF-Token", csrfToken)
  const response = await fetch(input, { ...init, headers, credentials: "same-origin" })
  lastRequestId = response.headers?.get("X-Request-ID") || null
  if (response.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event("repo-auth-required"))
  return response
}
