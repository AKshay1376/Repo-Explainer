import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(fileURLToPath(import.meta.url))
const view = readFileSync(join(root, "../components/Documentation/DocumentationView.tsx"), "utf8")
const dashboard = readFileSync(join(root, "../components/Dashboard.tsx"), "utf8")
const source = readFileSync(join(root, "../components/SourceViewer/SourceViewer.tsx"), "utf8")
const hook = readFileSync(join(root, "../hooks/useDocumentation.ts"), "utf8")

test("Documentation view is lazy-loaded with grounded type selector and TOC", () => {
  assert.ok(dashboard.includes('React.lazy(() => import("./Documentation/DocumentationView")'))
  for (const text of ["Document type", "Documentation contents", "FACT", "INFERENCE", "UNKNOWN", "Regenerate section"]) assert.ok(view.includes(text))
})
test("citations navigate to Source Viewer; README stays preview-first", () => {
  assert.ok(view.includes("onOpenSource({ path: ref.file"))
  assert.ok(source.includes("Document File") && source.includes("Document Symbol"))
  assert.ok(view.includes("Current README") && view.includes("Generated draft") && view.includes("Create Patch preview"))
})
test("exports and AI action are explicit", () => {
  assert.ok(hook.includes('"/api/docs/export"'))
  assert.ok(view.includes('["markdown", "html", "json"]') && view.includes('format === "markdown" ? ".md"'))
  assert.ok(view.includes("window.confirm") && view.includes("preview-only"))
})
test("change summaries accept a bounded commit or local release range", () => {
  assert.ok(view.includes("Commit or release range"))
  assert.ok(view.includes("Before SHA or local tag") && view.includes("After SHA or local tag"))
})
