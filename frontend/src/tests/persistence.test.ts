import test from "node:test"
import assert from "node:assert/strict"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { HomeView } from "../components/Home/HomeView"
import { localApi } from "../hooks/useProjects"
import { restoreWorkspace } from "../hooks/useSessionState"
import type { WorkspaceSession } from "../types/persistence"

const base: WorkspaceSession = { project_id: "p1", repo_sha: "a".repeat(40), active_view: "source",
  selected_file: "src/app.py", selected_symbol: null, source_start: 3, source_end: 5, graph_mode: null }

test("workspace restoration respects repository SHA and never resumes patch context", () => {
  assert.deepEqual(restoreWorkspace(base, "p1", "a".repeat(40)), { view: "source", file: "src/app.py", stale: false })
  assert.deepEqual(restoreWorkspace(base, "p1", "b".repeat(40)), { view: null, file: null, stale: true })
  assert.deepEqual(restoreWorkspace({ ...base, active_view: "patch" }, "p1", "a".repeat(40)), { view: null, file: "src/app.py", stale: false })
  assert.deepEqual(restoreWorkspace(base, "different", "a".repeat(40)), { view: null, file: null, stale: false })
})

test("local API handles JSON errors and forwards bounded project data", async () => {
  const original = globalThis.fetch
  const calls: unknown[][] = []
  globalThis.fetch = (async (...args: unknown[]) => { calls.push(args); return { ok: true, json: async () => ({ success: true, project: { id: "p1" } }) } as Response }) as typeof fetch
  try {
    const result = await localApi<{ project: { id: string } }>("/projects", "POST", { repo_url: "owner/repo" })
    assert.equal(result.project.id, "p1")
    assert.equal(calls[0][0], "/api/projects")
    assert.match((calls[0][1] as RequestInit).body as string, /owner\/repo/)
  } finally { globalThis.fetch = original }
})

test("local API surfaces rejected persistence requests", async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () => ({ ok: false, json: async () => ({ success: false, error: "Invalid local path" }) } as Response)) as typeof fetch
  try { await assert.rejects(localApi("/projects/p1", "PATCH", { local_path: ".env" }), /Invalid local path/) }
  finally { globalThis.fetch = original }
})

test("home renders local-first project entry and settings without a login", () => {
  const markup = renderToStaticMarkup(React.createElement(HomeView, { onAnalyze: () => undefined, onOpenProject: () => undefined }))
  assert.match(markup, /Your projects/)
  assert.match(markup, /Open Repository/)
  assert.match(markup, /Local settings and data/)
  assert.doesNotMatch(markup, /Sign in required/)
})

test("project UI is lazy-loaded and exposes saved artifacts and explicit deletion", () => {
  const root = dirname(fileURLToPath(import.meta.url))
  const dashboard = readFileSync(join(root, "../components/Dashboard.tsx"), "utf8")
  const project = readFileSync(join(root, "../components/Projects/ProjectDashboard.tsx"), "utf8")
  const docs = readFileSync(join(root, "../components/Documentation/DocumentationView.tsx"), "utf8")
  assert.match(dashboard, /React.lazy\(\(\) => import\("\.\/Projects\/ProjectDashboard"\)/)
  for (const label of ["Analysis history", "Recent files", "Bookmarks", "Saved Documentation", "Relink Repository", "Delete saved project data"]) assert.ok(project.includes(label))
  assert.ok(docs.includes("Save to Project"))
})
