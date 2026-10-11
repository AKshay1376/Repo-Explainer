import assert from "node:assert/strict"
import { test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { RepositoryModel } from "../types/repository"
import { availableViews, fileMatches, readWorkspaceLink, sanitizeLocation, symbolMatches, workspaceLink } from "../lib/workspaceNavigation"
import { WorkspaceShell } from "../components/WorkspaceShell"
import { Onboarding } from "../components/Onboarding"
import { ConfirmDialog } from "../components/ui/AccessibleDialog"

const model = {
  metadata: { owner: "owner", repo: "sample", default_branch: "main", latest_commit_sha: "a".repeat(40) },
  files: { "src/auth.ts": {}, "src/server.ts": {}, "docs/README.md": {} },
  symbols: [{ name: "login", file: "src/auth.ts", type: "function", line: 12 }],
  api_routes: [{ method: "POST", path: "/login", file: "src/auth.ts" }],
} as unknown as RepositoryModel

test("workspace groups hide unavailable operations while keeping safe views", () => {
  const views = availableViews({ local_filesystem: false, patch_apply: false, validator_execution: false }, false, true)
  assert.ok(views.includes("source"))
  assert.ok(views.includes("health"))
  for (const blocked of ["history", "patch", "validation", "project"]) assert.ok(!views.includes(blocked as typeof views[number]))
})

test("deep links accept only known repository paths and bounded metadata", () => {
  const views = availableViews({}, true, true)
  const parsed = readWorkspaceLink("?view=source&file=src%2Fauth.ts&line=12&end=18&symbol=login&commit=" + "b".repeat(40), model, views, "health")
  assert.equal(parsed.file, "src/auth.ts")
  assert.equal(parsed.line, 12)
  assert.equal(parsed.endLine, 18)
  assert.equal(parsed.symbol, "login")
  assert.equal(parsed.commit, "b".repeat(40))
  const unsafe = readWorkspaceLink("?view=source&file=C%3A%5Csecret.env&line=-5&commit=oops", model, views, "health")
  assert.equal(unsafe.file, null)
  assert.equal(unsafe.line, null)
  assert.equal(unsafe.commit, null)
  const url = workspaceLink(parsed, model, "saved-1")
  assert.match(url, /repo=owner%2Fsample/)
  assert.match(url, /file=src%2Fauth.ts/)
  assert.match(url, /end=18/)
  assert.equal(readWorkspaceLink("?view=source&file=src%2Fauth.ts&line=12&end=5", model, views, "health").endLine, null)
  assert.doesNotMatch(url, /C%3A|secret.env/)
  assert.equal(sanitizeLocation({ view: "patch", file: "src/auth.ts" }, model, ["source"], "source").view, "source")
})

test("quick open ranks file names and searches snapshot symbols without fetching", () => {
  assert.deepEqual(fileMatches(model, "auth"), ["src/auth.ts"])
  assert.deepEqual(symbolMatches(model, "log").map(item => item.name), ["login"])
  assert.deepEqual(fileMatches(model, "no-such-file"), [])
})

test("workspace shell has grouped, active, mobile, and keyboard navigation affordances", () => {
  const markup = renderToStaticMarkup(<WorkspaceShell location={{ view: "source", file: "src/auth.ts", line: 12 }} model={model}
    repoName="sample" branch="main" sha={"a".repeat(40)} capabilities={{ local_filesystem: false, patch_apply: false, validator_execution: false }}
    canBack={true} canForward={false} onBack={() => undefined} onForward={() => undefined} onNavigate={() => undefined}
    onOpenFile={() => undefined} onOpenSymbol={() => undefined} onHome={() => undefined} onSettings={() => undefined}>
    <p>Source content</p>
  </WorkspaceShell>)
  assert.match(markup, /Workspace navigation/)
  assert.match(markup, /Understand/)
  assert.match(markup, /aria-current="page"/)
  assert.match(markup, /Open navigation/)
  assert.match(markup, /Collapse sidebar/)
  assert.match(markup, /src<\/button>/)
  assert.match(markup, /Server connected/)
  assert.doesNotMatch(markup, /aria-label="Patch Review"/)
})

test("first-run and destructive dialogs explain the next action", () => {
  const onboarding = renderToStaticMarkup(<Onboarding onClose={() => undefined} />)
  assert.match(onboarding, /Open a repository/)
  assert.match(onboarding, /Change safely/i)
  assert.match(onboarding, /Skip/)
  const confirm = renderToStaticMarkup(<ConfirmDialog title="Delete project?" consequence="Saved data will be removed." confirmLabel="Delete project" onConfirm={() => undefined} onClose={() => undefined} />)
  assert.match(confirm, /aria-modal="true"/)
  assert.match(confirm, /Saved data will be removed/)
  assert.match(confirm, /Cancel/)
})
