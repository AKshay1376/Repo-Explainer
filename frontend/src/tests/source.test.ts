import { test } from "node:test"
import assert from "node:assert/strict"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { RepositoryModel } from "../types/repository"
import type { ExecutionStep } from "../types/trace"
import type { ImpactNode } from "../types/impact"
import { parseSourceReference, selectLineRange, findSourceMatches, sourceForStep, sourceForImpact, githubSourceUrl } from "../lib/sourceNavigation"
import { SourceCode } from "../components/SourceViewer/SourceCode"
import { SourceOutline } from "../components/SourceViewer/SourceOutline"

const model = {
  metadata: { owner: "demo", repo: "project", default_branch: "main", latest_commit_sha: "abc123" },
  symbols: [{ name: "run", type: "function", file: "src/main.py", line: 12 }],
  files: { "src/main.py": {} },
} as unknown as RepositoryModel

test("source references and range selection preserve exact lines", () => {
  assert.deepEqual(parseSourceReference("src/main.py:12-19"), { path: "src/main.py", startLine: 12, endLine: 19 })
  assert.equal(parseSourceReference("src/main.py:19-12"), null)
  assert.deepEqual(selectLineRange({ path: "src/main.py", startLine: 12 }, 19, true), { path: "src/main.py", startLine: 12, endLine: 19 })
})

test("source search returns exact line and column", () => {
  assert.deepEqual(findSourceMatches("alpha\nAlpha alpha", "alpha"), [{ line: 1, column: 1 }, { line: 2, column: 1 }, { line: 2, column: 7 }])
  assert.deepEqual(findSourceMatches("alpha\nAlpha", "Alpha", true), [{ line: 2, column: 1 }])
})

test("trace and impact navigation use known lines without inventing them", () => {
  const step = { file: "src/main.py", symbol: "run" } as ExecutionStep
  assert.deepEqual(sourceForStep(step, model), { path: "src/main.py", startLine: 12, endLine: 12 })
  assert.deepEqual(sourceForStep({ ...step, line: 5 }, model), { path: "src/main.py", startLine: 5, endLine: 5 })
  assert.deepEqual(sourceForStep({ file: "unknown.py" } as ExecutionStep, model), { path: "unknown.py" })
  assert.deepEqual(sourceForImpact({ file: "src/main.py", symbol: "run" } as ImpactNode, model), { path: "src/main.py", startLine: 12, endLine: 12 })
})

test("GitHub source links use the selected revision and line range", () => {
  assert.equal(githubSourceUrl(model, "src/main.py", "abc123", 12, 19), "https://github.com/demo/project/blob/abc123/src/main.py#L12-L19")
})

test("source code renders escaped text, line numbers, and selection", () => {
  const html = renderToStaticMarkup(React.createElement(SourceCode, { content: "<script>alert(1)</script>\nhello", language: "text", startLine: 2 }))
  assert.match(html, /&lt;script&gt;/)
  assert.match(html, /Select line 2/)
  assert.match(html, /bg-brand-surface/)
  assert.doesNotMatch(html, /<script>/)
})

test("outline lists only symbols with known lines for the selected file", () => {
  const html = renderToStaticMarkup(React.createElement(SourceOutline, { model, path: "src/main.py", onJump: () => {} }))
  assert.match(html, /run/)
  assert.match(html, /line 12/)
})


import { FileInspector } from "../components/FileInspector"
import { AskCitation } from "../components/AskRepo/AskCitation"
import { StepDetailsPanel } from "../components/ExecutionFlow/StepDetailsPanel"
import { ImpactDetailsPanel } from "../components/ChangeImpact/ImpactDetailsPanel"
import { EdgeDetailsModal } from "../components/ArchitectureGraph/EdgeDetailsModal"
import type { ImpactAnalysis } from "../types/impact"

test("FileInspector and Ask citations expose Source actions", () => {
  const inspect = renderToStaticMarkup(React.createElement(FileInspector, {
    model, filePath: "src/main.py", onSelectFile: () => {}, onOpenSource: () => {},
  }))
  assert.match(inspect, /View Source/)
  const citation = renderToStaticMarkup(React.createElement(AskCitation, {
    citation: { file: "src/main.py", line: 12 } as any, onInspectFile: () => {}, onShowInGraph: () => {}, onOpenSource: () => {},
  }))
  assert.match(citation, /Inspect/)
  assert.match(citation, /Source/)
})

test("Execution, impact, and graph details expose Source actions", () => {
  const step = { id: "1", file: "src/main.py", symbol: "run", line: 12, type: "SERVICE", label: "run", architecture_layer: "service", evidence: "call", confidence: "HIGH" } as ExecutionStep
  const stepHtml = renderToStaticMarkup(React.createElement(StepDetailsPanel, {
    step, onClose: () => {}, onInspectFile: () => {}, onShowInGraph: () => {}, onAskAboutStep: () => {}, onTraceFromStep: () => {}, onOpenSource: () => {},
  }))
  assert.match(stepHtml, /View Source/)
  const node = { id: "1", file: "src/main.py", symbol: "run", category: "service", architecture_layer: "service", impact_type: "TARGET", depth: 0, confidence: "CONFIRMED", evidence: "call", path_from_target: ["src/main.py"], line: 12 } as ImpactNode
  const impactHtml = renderToStaticMarkup(React.createElement(ImpactDetailsPanel, {
    analysis: { nodes: [node] } as ImpactAnalysis, selectedNode: node, selectedEdge: null, onCloseSelection: () => {}, onSelectNode: () => {}, onOpenSource: () => {},
  }))
  assert.match(impactHtml, /View Source/)
  const edgeHtml = renderToStaticMarkup(React.createElement(EdgeDetailsModal, {
    edgeData: { source: "src/main.py", target: "src/other.py", type: "imports", confidence: 0.9, evidence: "import" }, onClose: () => {}, onOpenSource: () => {},
  }))
  assert.equal((edgeHtml.match(/Source code/g) || []).length, 2)
})


import { SourceViewer } from "../components/SourceViewer/SourceViewer"

test("Source viewer offers a read-only file path entry", () => {
  const html = renderToStaticMarkup(React.createElement(SourceViewer, {
    repoUrl: "https://github.com/demo/project", model, location: null, onNavigate: () => {}, visible: true,
  }))
  assert.match(html, /Source Code Viewer/)
  assert.match(html, /Repository file path/)
  assert.match(html, /Choose a file to view its source/)
})

import { SourceHeader } from "../components/SourceViewer/SourceHeader"

test("sensitive file header omits direct raw GitHub link", () => {
  const html = renderToStaticMarkup(React.createElement(SourceHeader, {
    file: { path: ".env", language: "ini", content: "[REDACTED SECRET FILE]", line_count: 1, size: 22, commit_sha: "abc123", redacted: true, is_sensitive: true, is_binary: false, is_generated: false, warning: "Sensitive value redacted" },
    location: { path: ".env" }, githubUrl: "https://github.com/demo/project/blob/abc123/.env", copied: null,
    onCopyPath: () => {}, onCopyLines: () => {}, onCopyReference: () => {},
  }))
  assert.doesNotMatch(html, /Open on GitHub/)
})

test("trailing newline does not create an extra source line", () => {
  const html = renderToStaticMarkup(React.createElement(SourceCode, { content: "one\n", language: "text" }))
  assert.match(html, /Select line 1/)
  assert.doesNotMatch(html, /Select line 2/)
})

test("files over 10,000 lines render only the visible window", () => {
  const html = renderToStaticMarkup(React.createElement(SourceCode, { content: Array(10001).fill("line").join("\n"), language: "text" }))
  assert.match(html, /Select line 1/)
  assert.doesNotMatch(html, /Select line 9999/)
  assert.ok((html.match(/aria-label="Select line /g) || []).length < 150)
})
