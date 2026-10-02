import { test } from "node:test"
import assert from "node:assert/strict"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { RepositoryModel } from "../types/repository"
import type { PlanStep } from "../types/refactor"
import type { HumanizeFinding } from "../types/humanize"
import type { ExecutionStep } from "../types/trace"
import { PLAN_TYPES } from "../types/refactor"
import { RefactorPlannerView } from "../components/RefactorPlanner/RefactorPlannerView"
import { PlanStepCard } from "../components/RefactorPlanner/PlanStepCard"
import { buildPlanGraph } from "../components/RefactorPlanner/PlanGraph"
import { FindingCard } from "../components/Humanize/FindingCard"
import { StepDetailsPanel } from "../components/ExecutionFlow/StepDetailsPanel"
import { FileInspector } from "../components/FileInspector"

const model = { metadata: { owner: "demo", repo: "repo", default_branch: "main" },
  files: { "src/main.py": {} }, symbols: [], dependencies: [], api_routes: [], database_models: [], entry_points: [],
  architecture_layers: {} } as unknown as RepositoryModel
const first: PlanStep = {
  id: "definition", order: 1, title: "Rename definition", description: "Keep API behavior", target: "src/main.py",
  change_type: "rename_symbol", prerequisites: [], affected_files: ["src/main.py"], affected_symbols: ["run"],
  source_locations: [{ path: "src/main.py", line: 8, kind: "definition" }], validation: [], risk_level: "HIGH",
  confidence: "HIGH", can_auto_preview: false, requires_manual_review: true,
}
const second: PlanStep = { ...first, id: "validate", order: 2, title: "Run validation", prerequisites: ["definition"],
  risk_level: "LOW", requires_manual_review: false }

test("planner exposes all twelve plan types and target controls", () => {
  assert.equal(PLAN_TYPES.length, 12)
  const html = renderToStaticMarkup(React.createElement(RefactorPlannerView, {
    repoUrl: "demo/repo", model, onOpenSource: () => {}, onOpenImpact: () => {}, onOpenGraph: () => {},
  }))
  assert.match(html, /Refactoring &amp; Migration Planner/)
  assert.match(html, /Rename Symbol/)
  assert.match(html, /Database Model Migration/)
  assert.match(html, /Generate plan/)
  assert.match(html, /No repository code is changed or executed/)
})

test("plan graph uses the existing DAG layout and preserves prerequisites", () => {
  const graph = buildPlanGraph([first, second])
  assert.equal(graph.nodes.length, 2)
  assert.equal(graph.edges.length, 1)
  assert.deepEqual([graph.edges[0].source, graph.edges[0].target], ["definition", "validate"])
  assert.ok(graph.nodes[1].position.x > graph.nodes[0].position.x)
})

test("plan steps show risk, source, impact, and graph navigation", () => {
  const html = renderToStaticMarkup(React.createElement(PlanStepCard, {
    step: first, onOpenSource: () => {}, onOpenImpact: () => {}, onOpenGraph: () => {},
  }))
  assert.match(html, /HIGH risk/)
  assert.match(html, /View Source/)
  assert.match(html, /View Impact/)
  assert.match(html, /View Graph/)
  assert.match(html, /Manual review/)
})

test("Humanize finding can be promoted into a refactor plan", () => {
  const finding: HumanizeFinding = { id: "long_function:8", category: "complexity", rule: "long_function", line: 8,
    end_line: 20, message: "Function run spans 13 lines.", evidence: "def run():", confidence: "HIGH",
    severity: "MEDIUM", suggestion: "Split responsibilities", auto_fixable: false }
  const html = renderToStaticMarkup(React.createElement(FindingCard, {
    path: "src/main.py", finding, onOpenSource: () => {}, onCreatePlan: () => {},
  }))
  assert.match(html, /Create Refactor Plan/)
})

test("Execution Flow and FileInspector expose planner entry points", () => {
  const step = { id: "s", file: "src/main.py", symbol: "run", type: "SERVICE", label: "run",
    architecture_layer: "service", evidence: "call", confidence: "HIGH" } as ExecutionStep
  const flow = renderToStaticMarkup(React.createElement(StepDetailsPanel, {
    step, onClose: () => {}, onInspectFile: () => {}, onShowInGraph: () => {}, onAskAboutStep: () => {},
    onTraceFromStep: () => {}, onCreatePlan: () => {},
  }))
  const inspector = renderToStaticMarkup(React.createElement(FileInspector, {
    model, filePath: "src/main.py", onSelectFile: () => {}, onCreatePlan: () => {},
  }))
  assert.match(flow, /Create Refactor Plan/)
  assert.match(inspector, /Plan refactor/)
})
