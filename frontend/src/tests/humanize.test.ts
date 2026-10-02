import { test } from "node:test"
import assert from "node:assert/strict"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { RepositoryModel } from "../types/repository"
import type { HumanizeFinding, HumanizePreview } from "../types/humanize"
import type { ExecutionStep } from "../types/trace"
import type { ImpactAnalysis, ImpactNode } from "../types/impact"
import { HumanizeView } from "../components/Humanize/HumanizeView"
import { FindingCard } from "../components/Humanize/FindingCard"
import { PatchPreview } from "../components/Humanize/PatchPreview"
import { FileInspector } from "../components/FileInspector"
import { AskCitation } from "../components/AskRepo/AskCitation"
import { StepDetailsPanel } from "../components/ExecutionFlow/StepDetailsPanel"
import { ImpactDetailsPanel } from "../components/ChangeImpact/ImpactDetailsPanel"

const model = { metadata: { owner: "demo", repo: "repo", default_branch: "main" }, files: { "src/main.py": {} }, symbols: [], dependencies: [], api_routes: [], database_models: [], entry_points: [], architecture_layers: {} } as unknown as RepositoryModel

const finding: HumanizeFinding = {
  id: "long_line:8", category: "readability", rule: "long_line", line: 8, end_line: 8,
  message: "Line is long", evidence: "value = <script>", confidence: "HIGH", severity: "LOW",
  suggestion: "Wrap expression", auto_fixable: false,
}

test("Humanize view exposes modes, file analysis, and analysis-only audit", () => {
  const html = renderToStaticMarkup(React.createElement(HumanizeView, {
    repoUrl: "https://github.com/demo/repo", model, onOpenSource: () => {}, onAnalyzeImpact: () => {}, onAskRepo: () => {},
  }))
  assert.match(html, /Humanize Codebase/)
  assert.match(html, /Conservative/)
  assert.match(html, /Balanced/)
  assert.match(html, /Aggressive/)
  assert.match(html, /Audit repository/)
  assert.match(html, /never refactors the repository/)
})

test("finding cards show grounded evidence and exact source line safely", () => {
  const html = renderToStaticMarkup(React.createElement(FindingCard, { path: "src/main.py", finding, onOpenSource: () => {} }))
  assert.match(html, /L8/)
  assert.match(html, /HIGH confidence/)
  assert.match(html, /View Source/)
  assert.match(html, /&lt;script&gt;/)
  assert.doesNotMatch(html, /<script>/)
})

test("patch previews offer copy/download and no automatic apply", () => {
  const preview: HumanizePreview = { id: "final_newline", title: "Add final newline", patch: "--- a/f.py\n+++ b/f.py\n@@ -1 +1 @@\n", risk_level: "LOW", preserves_public_api: true, preview_only: true }
  const html = renderToStaticMarkup(React.createElement(PatchPreview, { preview, path: "f.py" }))
  assert.match(html, /Copy patch/)
  assert.match(html, /Download patch/)
  assert.match(html, /preview only/)
  assert.doesNotMatch(html, />Apply patch</)
})

test("FileInspector, citations, execution steps, and impact nodes link to Humanize", () => {
  const inspector = renderToStaticMarkup(React.createElement(FileInspector, { model, filePath: "src/main.py", onSelectFile: () => {}, onHumanize: () => {} }))
  assert.match(inspector, /Humanize/)
  const citation = renderToStaticMarkup(React.createElement(AskCitation, { citation: { file: "src/main.py", line: 8 } as any, onHumanize: () => {} }))
  assert.match(citation, /Humanize/)
  const step = { id: "s", file: "src/main.py", type: "SERVICE", label: "main", architecture_layer: "service", evidence: "call", confidence: "HIGH" } as ExecutionStep
  const execution = renderToStaticMarkup(React.createElement(StepDetailsPanel, { step, onClose: () => {}, onInspectFile: () => {}, onShowInGraph: () => {}, onAskAboutStep: () => {}, onTraceFromStep: () => {}, onHumanize: () => {} }))
  assert.match(execution, /Humanize/)
  const node = { id: "n", file: "src/main.py", impact_type: "TARGET", depth: 0, confidence: "CONFIRMED", category: "service", architecture_layer: "service", evidence: "call", path_from_target: [] } as ImpactNode
  const impact = renderToStaticMarkup(React.createElement(ImpactDetailsPanel, { analysis: { nodes: [node] } as ImpactAnalysis, selectedNode: node, selectedEdge: null, onCloseSelection: () => {}, onSelectNode: () => {}, onHumanize: () => {} }))
  assert.match(impact, /Humanize/)
})
