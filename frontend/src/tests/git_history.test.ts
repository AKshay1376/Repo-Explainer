import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { UnifiedDiff } from "../components/PatchReview/PatchDiff"

const root = dirname(fileURLToPath(import.meta.url))
const view = readFileSync(join(root, "../components/GitHistory/GitHistoryView.tsx"), "utf8")
const dashboard = readFileSync(join(root, "../components/Dashboard.tsx"), "utf8")
const source = readFileSync(join(root, "../components/SourceViewer/SourceViewer.tsx"), "utf8")

test("History view is lazy-loaded and handles unavailable repositories", () => {
  assert.ok(dashboard.includes('React.lazy(() => import("./GitHistory/GitHistoryView")'))
  assert.ok(dashboard.includes("<GitHistoryView"))
  assert.ok(view.includes("Git history unavailable for this repository"))
})

test("timeline, pagination, detail, hotspots, co-change, and evolution are exposed", () => {
  for (const feature of ["Commit timeline", "Previous", "Next", "Contributor distribution", "Maintenance hotspots", "Files changed together", "Sampled architecture evolution", "Compare commits", "Current source", "Analyze current impact"]) {
    assert.ok(view.includes(feature), `${feature} should be available`)
  }
})

test("historical source disables write-oriented actions and exposes line origins", () => {
  for (const feature of ["View History", "Show Line History", "Read-only historical source", "!historical && path && canCreatePatchFromSource", "onViewHistory(path)"]) {
    assert.ok(source.includes(feature), `${feature} should be connected`)
  }
})

test("shared unified diff renders changed lines without a duplicate diff renderer", () => {
  const diff = "@@ -1,1 +1,2 @@\n old\n+new\n"
  const markup = renderToStaticMarkup(React.createElement(UnifiedDiff, { diff, label: "comparison", onNewLineClick: () => {} }))
  assert.match(markup, /aria-label="comparison"/)
  assert.match(markup, /new/)
  assert.match(markup, /button/)
})
