import assert from "node:assert/strict"
import { test } from "node:test"
import { apiFetch, getLastRequestId, setCsrfToken } from "../apiClient"
import { jobLabel, tabAvailable } from "../lib/deployment"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ServiceUnavailable } from "../components/ServiceUnavailable"
import { ErrorBoundary } from "../components/ErrorBoundary"

test("API client keeps CSRF token in memory and attaches it only to writes", async () => {
  const original = globalThis.fetch
  const calls: RequestInit[] = []
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(init || {})
    return { status: 200, headers: new Headers({ "X-Request-ID": "request123" }) } as Response
  }) as typeof fetch
  try {
    setCsrfToken("temporary-csrf")
    await apiFetch("/api/projects", { method: "POST", body: "{}" })
    await apiFetch("/api/projects")
    assert.equal(new Headers(calls[0].headers).get("X-CSRF-Token"), "temporary-csrf")
    assert.equal(new Headers(calls[1].headers).get("X-CSRF-Token"), null)
    assert.equal(getLastRequestId(), "request123")
    assert.equal(calls[0].credentials, "same-origin")
  } finally {
    setCsrfToken(null)
    globalThis.fetch = original
  }
})

test("public deployment hides local actions while keeping analysis views", () => {
  const publicCaps = { local_filesystem: false, patch_apply: false, validator_execution: false }
  assert.equal(tabAvailable("patch", publicCaps), false)
  assert.equal(tabAvailable("validation", publicCaps), false)
  assert.equal(tabAvailable("history", publicCaps), false)
  assert.equal(tabAvailable("health", publicCaps), true)
})

test("background job states have clear visible labels", () => {
  for (const status of ["queued", "running", "completed", "failed", "cancelled"]) {
    assert.equal(jobLabel(status).toLowerCase(), status)
  }
})

test("offline and error screens expose recovery actions without stack traces", () => {
  const offline = renderToStaticMarkup(React.createElement(ServiceUnavailable, { retry: () => undefined }))
  assert.match(offline, /Analysis service unavailable/)
  assert.match(offline, /Retry/)
  const boundary = new ErrorBoundary({ children: null })
  boundary.state = { failed: true }
  const failed = renderToStaticMarkup(boundary.render())
  assert.match(failed, /Something went wrong/)
  assert.match(failed, /Return Home/)
  assert.doesNotMatch(failed, /stack trace|Traceback/)
})
