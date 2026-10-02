import { test } from "node:test"
import assert from "node:assert/strict"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ValidationView } from "../components/Validation/ValidationView"
import { stageGraph, type ValidatorProfile, type ValidatorResult } from "../types/validators"
import { PatchFileList } from "../components/PatchReview/PatchFileList"
import { PlanStepCard } from "../components/RefactorPlanner/PlanStepCard"
import { canApplyPatch } from "../lib/patchSelection"
import type { PatchFile, PatchSet } from "../types/patch"
import type { PlanStep } from "../types/refactor"

const profile: ValidatorProfile = { id: "one", repo_id: "local:one", detected_stack: ["Python", "TypeScript", "Vite"],
  trusted: false, trust_scope: "untrusted", warnings: [], commands: [
    { id: "py", kind: "test", label: "unit tests", command: ["python", "-m", "unittest"],
      working_directory: ".", source: "Python test files", confidence: "HIGH", trusted: false },
    { id: "ts", kind: "typecheck", label: "typecheck", command: ["npx", "tsc", "--noEmit"],
      working_directory: "frontend", source: "tsconfig.json", confidence: "HIGH", trusted: false },
  ] }
const result: ValidatorResult = { command_id: "py", timestamp: "2026-01-01", duration_seconds: 0.5,
  exit_code: 0, state: "PASSED", output_summary: "OK", revision: "abc", patch_id: "p", paths: ["pkg/old.py"] }

test("Validation panel shows detected commands, trust controls, and history", () => {
  const html = renderToStaticMarkup(React.createElement(ValidationView, {
    repoUrl: "demo/repo", initialProfile: profile, initialHistory: [result], paths: ["pkg/old.py"],
  }))
  assert.match(html, /Detected stack: Python, TypeScript, Vite/)
  assert.match(html, /UNTRUSTED/)
  assert.match(html, /Review Commands/)
  assert.match(html, /Trust Once/)
  assert.match(html, /Trust Repository/)
  assert.match(html, /Run Selected/)
  assert.match(html, /Validation history \(1\)/)
  assert.match(html, /unit tests/)
})

test("dependency stages show trust, pass, timeout, and not-run state", () => {
  assert.equal(stageGraph(profile, [])[4].state, "NOT_TRUSTED")
  assert.equal(stageGraph({ ...profile, commands: profile.commands.map((item) => ({ ...item, trusted: true })) }, [])[4].state, "NOT_RUN")
  assert.equal(stageGraph(profile, [result])[4].state, "PASSED")
  assert.equal(stageGraph(profile, [{ ...result, state: "TIMEOUT" }])[4].state, "TIMEOUT")
})

test("file moves display destination and low-confidence plans cannot easy apply", () => {
  const file: PatchFile = { path: "pkg/old.py", operation: "move", destination_path: "pkg/new.py",
    confidence: "HIGH", patch_support: "Verified", original_hash: "a", proposed_hash: "b", risk_level: "HIGH",
    public_api_change: false, changed_lines: 0, warnings: [], unified_diff: "rename from pkg/old.py\nrename to pkg/new.py\n",
    hunks: [{ id: "move", old_start: 1, old_count: 0, new_start: 1, new_count: 0, original_lines: [],
      proposed_lines: [], reason: "Move", confidence: "HIGH", depends_on: [] }] }
  const html = renderToStaticMarkup(React.createElement(PatchFileList, { files: [file], selected: ["pkg/old.py:move"], onChange: () => {} }))
  assert.match(html, /pkg\/old.py → pkg\/new.py/)
  const patch = { status: "ready", source: "planner", confidence: "MEDIUM", risk_level: "HIGH", files: [file] } as PatchSet
  assert.equal(canApplyPatch(patch, ["pkg/old.py:move"], { state: "PASSED", checks: [] }, true, true, false), false)
  const step: PlanStep = { id: "move", order: 2, title: "Move", description: "Move source", target: "pkg/old.py",
    change_type: "move_file", prerequisites: [], affected_files: ["pkg/old.py"], affected_symbols: [],
    source_locations: [], validation: [], risk_level: "HIGH", confidence: "HIGH", can_auto_preview: true,
    requires_manual_review: false }
  assert.match(renderToStaticMarkup(React.createElement(PlanStepCard, { step,
    onOpenSource: () => {}, onOpenImpact: () => {}, onOpenGraph: () => {} })), /Patch Support: Verified/)
})
