import { test } from "node:test"
import assert from "node:assert/strict"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { PatchFile, PatchSet } from "../types/patch"
import { canApplyPatch, hunkIds, toggleFile, toggleHunk } from "../lib/patchSelection"
import { PatchDiff } from "../components/PatchReview/PatchDiff"
import { PatchFileList } from "../components/PatchReview/PatchFileList"
import { ApplyChecklist } from "../components/PatchReview/ApplyChecklist"
import { ValidationResults } from "../components/PatchReview/ValidationResults"
import { PatchHistory } from "../components/PatchReview/PatchHistory"
import { RollbackPanel } from "../components/PatchReview/RollbackPanel"
import { PatchReviewView } from "../components/PatchReview/PatchReviewView"
import { PatchPreview } from "../components/Humanize/PatchPreview"
import { PlanStepCard } from "../components/RefactorPlanner/PlanStepCard"
import { FileInspector } from "../components/FileInspector"
import type { RepositoryModel } from "../types/repository"
import { canCreatePatchFromSource } from "../lib/patchSource"
import type { SourceFile } from "../types/source"

const file: PatchFile = { path: "src/main.py", original_hash: "old", proposed_hash: "new", risk_level: "HIGH",
  public_api_change: true, changed_lines: 2, warnings: [], unified_diff: "--- a/src/main.py\n+++ b/src/main.py\n@@ -1 +1 @@\n-a\n+b\n",
  hunks: [{ id: "h1", old_start: 1, old_count: 1, new_start: 1, new_count: 1, original_lines: ["a\n"],
    proposed_lines: ["b\n"], reason: "rename", confidence: "HIGH", depends_on: [] },
    { id: "h2", old_start: 3, old_count: 1, new_start: 3, new_count: 1, original_lines: ["c\n"],
      proposed_lines: ["d\n"], reason: "cleanup", confidence: "HIGH", depends_on: ["h1"] }] }
const validation: PatchSet["validation"] = { state: "PASSED", checks: [{ state: "PASSED", command: "Python AST parse", exit_code: 0, output_summary: "syntax valid" }],
  checklist: { hashes_current: true, paths_safe: true, dependencies_satisfied: true } }
const patch = { id: "abc", source: "planner", source_id: "plan1:definition", repo_revision: "sha", status: "ready", summary: "Rename",
  risk_level: "HIGH", files: [file], created_at: "now", warnings: [], validation, rollback_available: false, impact: {}, git: {}, selected_hunks: [] } as PatchSet
const model = { metadata: { owner: "demo", repo: "repo", default_branch: "main" }, files: { "src/main.py": {} },
  symbols: [], dependencies: [], api_routes: [], database_models: [], entry_points: [], architecture_layers: {} } as unknown as RepositoryModel

test("file and hunk selection stays independent", () => {
  assert.deepEqual(hunkIds([file]), ["src/main.py:h1", "src/main.py:h2"])
  assert.deepEqual(toggleHunk([], "src/main.py:h1"), ["src/main.py:h1"])
  assert.deepEqual(toggleFile([], file), hunkIds([file]))
  assert.deepEqual(toggleFile(hunkIds([file]), file), [])
  assert.deepEqual(toggleHunk([], "src/main.py:h2", file), hunkIds([file]))
  assert.deepEqual(toggleHunk(hunkIds([file]), "src/main.py:h1", file), [])
})

test("apply remains gated by validation, approval, high risk, and public API acknowledgement", () => {
  const ids = hunkIds([file])
  assert.equal(canApplyPatch(patch, ids, null, true, true, true), false)
  assert.equal(canApplyPatch(patch, ids, validation, false, true, true), false)
  assert.equal(canApplyPatch(patch, ids, validation, true, false, true), false)
  assert.equal(canApplyPatch(patch, ids, validation, true, true, false), false)
  assert.equal(canApplyPatch(patch, ids, validation, true, true, true), true)
  assert.equal(canApplyPatch({ ...patch, status: "stale" }, ids, validation, true, true, true), false)
})

test("Patch Review renders local setup and manual selected-range preview", () => {
  const html = renderToStaticMarkup(React.createElement(PatchReviewView, { repoUrl: "demo/repo", model,
    onOpenImpact: () => {}, onOpenSource: () => {} }))
  assert.match(html, /Patch Review/)
  assert.match(html, /PATCH_LOCAL_ROOT/)
  assert.match(html, /Generate selected-range preview/)
})

test("unified and side-by-side views expose changed source", () => {
  const unified = renderToStaticMarkup(React.createElement(PatchDiff, { file, mode: "unified", selected: hunkIds([file]) }))
  const side = renderToStaticMarkup(React.createElement(PatchDiff, { file, mode: "side-by-side", selected: hunkIds([file]) }))
  assert.match(unified, /unified diff/)
  assert.match(unified, /--- a\/src\/main.py/)
  assert.match(side, /side-by-side diff/)
  assert.match(side, /Original/)
  assert.match(side, /Proposed/)
})

test("file list shows dependencies and public API risk", () => {
  const html = renderToStaticMarkup(React.createElement(PatchFileList, { files: [file], selected: hunkIds([file]), onChange: () => {} }))
  assert.match(html, /depends on h1/)
  assert.match(html, /Public API acknowledgement required/)
})

test("checklist, validation output, and history are visible", () => {
  const checklist = renderToStaticMarkup(React.createElement(ApplyChecklist, { patch, validation, selected: hunkIds([file]),
    highRisk: false, publicApi: false, onHighRisk: () => {}, onPublicApi: () => {} }))
  const result = renderToStaticMarkup(React.createElement(ValidationResults, { validation }))
  const history = renderToStaticMarkup(React.createElement(PatchHistory, { history: [{ id: "abc", source: "planner", created_at: "now",
    status: "applied", risk_level: "HIGH", files: [file.path], validation, rollback_available: true }], onOpen: () => {} }))
  assert.match(checklist, /Pre-apply checklist/)
  assert.match(checklist, /high-risk change/)
  assert.match(result, /Python AST parse/)
  assert.match(history, /Patch history/)
  assert.match(history, /applied/)
})

test("rollback panel offers per-file restore and conflict acknowledgement", () => {
  const html = renderToStaticMarkup(React.createElement(RollbackPanel, { patchId: "abc", files: ["src/main.py", "src/other.py"],
    selected: ["src/main.py"], onSelected: () => {}, confirmConflict: false, onConflict: () => {},
    onRollback: () => {}, loading: false }))
  assert.match(html, /Rollback selected files/)
  assert.match(html, /Allow overwrite if files changed/)
  assert.match(html, /src\/other.py/)
})

test("Source Viewer patch action excludes sensitive, binary, and redacted source", () => {
  const source = { path: "src/main.py", language: "python", content: "x = 1\n", line_count: 1,
    size: 6, commit_sha: "sha", redacted: false, is_binary: false, is_generated: false, warning: null } as SourceFile
  assert.equal(canCreatePatchFromSource(source), true)
  assert.equal(canCreatePatchFromSource({ ...source, is_sensitive: true }), false)
  assert.equal(canCreatePatchFromSource({ ...source, is_binary: true }), false)
  assert.equal(canCreatePatchFromSource({ ...source, redacted: true }), false)
})

test("Humanize, Planner, and File Inspector expose patch entry points", () => {
  const humanize = renderToStaticMarkup(React.createElement(PatchPreview, { path: file.path, onReview: () => {},
    preview: { id: "final_newline", title: "Add newline", patch: "+\n", risk_level: "LOW", preserves_public_api: true, preview_only: true } }))
  const planner = renderToStaticMarkup(React.createElement(PlanStepCard, { step: { id: "definition", order: 1, title: "Rename",
    description: "Rename private function", target: file.path, change_type: "rename_symbol", prerequisites: [], affected_files: [file.path],
    affected_symbols: ["_helper"], source_locations: [{ path: file.path, line: 1, kind: "definition" }], validation: [],
    risk_level: "MEDIUM", confidence: "HIGH", can_auto_preview: true, requires_manual_review: false },
    onOpenSource: () => {}, onOpenImpact: () => {}, onOpenGraph: () => {}, onGeneratePatch: () => {} }))
  const inspector = renderToStaticMarkup(React.createElement(FileInspector, { model, filePath: file.path,
    onSelectFile: () => {}, onCreatePatch: () => {} }))
  assert.match(humanize, /Open in Patch Review/)
  assert.match(planner, /Generate Patch/)
  assert.match(inspector, /Create Patch/)
})
