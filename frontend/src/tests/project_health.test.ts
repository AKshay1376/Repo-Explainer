import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { filterHealthFindings } from "../lib/projectHealth"
import type { HealthFinding } from "../types/projectHealth"

const base: HealthFinding = {
  id: "one", category: "Architecture", rule: "cycle", severity: "MEDIUM", confidence: "HIGH",
  title: "Cycle", summary: "Two files", why_it_matters: "Maintenance", file: "src/core/a.py",
  symbol: null, start_line: null, end_line: null, evidence: { type: "cycle" },
  impact_summary: null, source: "Repository model", suggested_actions: ["View Source"],
}

const viewSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../components/ProjectHealth/ProjectHealthView.tsx"), "utf8")
const dashboardSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../components/Dashboard.tsx"), "utf8")

test("health filters combine category, severity, confidence, and folder", () => {
  const findings: HealthFinding[] = [base, { ...base, id: "two", category: "Security", severity: "HIGH", confidence: "MEDIUM", file: "config/settings.py" }]
  assert.deepEqual(filterHealthFindings(findings, { category: "Architecture", severity: "MEDIUM", confidence: "HIGH", path: "CORE" }).map(item => item.id), ["one"])
  assert.deepEqual(filterHealthFindings(findings, { category: "All", severity: "HIGH", confidence: "All", path: "" }).map(item => item.id), ["two"])
  assert.deepEqual(filterHealthFindings(findings, { category: "All", severity: "All", confidence: "LOW", path: "" }), [])
  assert.deepEqual(filterHealthFindings([{ ...base, suggested_actions: [] }, { ...base, id: "action" }], { category: "All", severity: "All", confidence: "All", path: "", actionableOnly: true }).map(item => item.id), ["action"])
})

test("health dashboard renders score cards, severity groups, coverage, and empty state", () => {
  for (const text of ["result.overall.score", "result.dimensions[name]", "levels.map(level", "result.coverage", "No high-confidence issues detected", "How scores are calculated"]) {
    assert.ok(viewSource.includes(text), `${text} must be visible in Project Health`)
  }
  assert.ok(dashboardSource.includes("<ProjectHealthView"))
})

test("health actions reuse source, impact, Humanize, planner, patch, and reference navigation", () => {
  for (const action of ["onOpenSource({ path", "onAnalyzeImpact({ file: path })", "onHumanize(path)", "onCreatePlan({", "onCreatePatch({ source: \"humanize\"", "setReferencePath("]) {
    assert.ok(viewSource.includes(action), `${action} must be connected`)
  }
})
