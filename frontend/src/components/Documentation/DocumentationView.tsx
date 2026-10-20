import React, { useEffect, useState } from "react"
import type { RepositoryModel } from "../../types/repository"
import type { SourceLocation } from "../../types/source"
import type { PatchTrigger } from "../../types/patch"
import { DOC_TYPES, type DocSection, type DocType, type DocumentTarget } from "../../types/documentation"
import { useDocumentation } from "../../hooks/useDocumentation"
import { localApi } from "../../hooks/useProjects"
import { LifecycleGraph } from "../Lifecycle/LifecycleGraph"

interface Props { repoUrl: string; model: RepositoryModel; target?: DocumentTarget | null; initialSection?: string | null; visible?: boolean; onSelectSection?: (section: string) => void; onOpenSource: (location: SourceLocation) => void; onCreatePatch: (trigger: PatchTrigger) => void; projectId?: string | null }
const label = (type: string) => type.replace(/_/g, " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase())
const localMarkdown = (title: string, revision: string, sections: DocSection[]) => `# ${title}\n\nRevision: ${revision}\n\n` + sections.map(part => `## ${part.title}\n\n` +
  ([...part.facts.map(value => `- **FACT:** ${value}`), ...part.inferences.map(value => `- **INFERENCE:** ${value}`), ...part.unknowns.map(value => `- **UNKNOWN:** ${value}`), ...part.citations.map(ref => `- Source: ${ref.file}${ref.start_line ? `:${ref.start_line}` : ""}`)].join("\n")) +
  (part.diagram ? `\n\n\`\`\`mermaid\n${part.diagram}\n\`\`\`` : "")).join("\n\n")

export const DocumentationView: React.FC<Props> = ({ repoUrl, model, target, initialSection, visible = true, onSelectSection, onOpenSource, onCreatePatch, projectId }) => {
  const [docType, setDocType] = useState<DocType>(target?.type || "PROJECT_OVERVIEW")
  const [scope, setScope] = useState(target?.scope || "")
  const [period, setPeriod] = useState("latest")
  const [before, setBefore] = useState("")
  const [after, setAfter] = useState("")
  const [activeTarget, setActiveTarget] = useState<DocumentTarget | null>(null)
  const [aiPreview, setAiPreview] = useState("")
  const [actionError, setActionError] = useState("")
  const [saved, setSaved] = useState("")
  const { document, currentReadme, readmeDraft, readmePatchReady, loading, error, generate, regenerateSection, download, request } = useDocumentation(repoUrl, model)
  useEffect(() => {
    if (visible && initialSection && document?.sections.some(part => part.id === initialSection)) {
      window.document.getElementById(`doc-${initialSection}`)?.scrollIntoView({ block: "start" })
    }
  }, [initialSection, document?.id, visible])
  const run = (candidate: DocumentTarget) => { setActiveTarget(candidate); setAiPreview(""); void generate(candidate) }
  useEffect(() => { if (target) { setDocType(target.type); setScope(target.scope || ""); run(target) } }, [target?.requestId])
  const selected = (): DocumentTarget => ({ type: docType, scope: scope.trim() || undefined,
    options: docType === "CHANGE_SUMMARY" ? { period, ...(period === "range" ? { before: before.trim(), after: after.trim() } : {}) } : undefined })
  const guarded = async (action: () => Promise<void>) => {
    setActionError(""); try { await action() } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Action failed.") }
  }
  const copy = async (text: string) => guarded(async () => navigator.clipboard.writeText(text))
  const save = () => guarded(async () => {
    if (!document || !projectId) return
    await localApi(`/projects/${projectId}/documents`, "POST", { document_id: document.id, format: "markdown" })
    setSaved("Saved to this project. Open it from the Project tab after a restart.")
  })
  const polish = (sectionId: string) => guarded(async () => {
    if (!document || !window.confirm("Send this generated section's evidence to AI for a preview-only writing suggestion?")) return
    const result = await request<{ polished_preview: string }>("ai-polish", { document_id: document.id, section_id: sectionId, confirm_ai: true })
    setAiPreview(result.polished_preview)
  })
  const patchReadme = () => {
    if (!document || !currentReadme || !readmeDraft) return
    const proposal = readmeDraft
    onCreatePatch({ source: "selection", path: "README.md", startLine: 1,
      endLine: Math.max(1, currentReadme.split(/\r?\n/).length - (currentReadme.endsWith("\n") ? 1 : 0)),
      transformation: "replace_range", replacement: proposal })
  }
  return <section aria-label="Documentation Generator" className="space-y-5">
    <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-3">
      <h2 className="text-lg font-bold text-ink">Documentation Generator</h2>
      <p className="text-xs text-ink-secondary">Source-backed drafts distinguish facts, inferences, and unknowns. Normal generation uses 0 AI calls. No repository code is executed.</p>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Document type" value={docType} onChange={event => setDocType(event.target.value as DocType)} className="rounded border border-line p-2 text-xs">{DOC_TYPES.map(item => <option key={item} value={item}>{label(item)}</option>)}</select>
        <input aria-label="Documentation scope" value={scope} onChange={event => setScope(event.target.value)} placeholder="Optional file, route, or model" list="doc-paths" className="min-w-52 flex-1 rounded border border-line p-2 text-xs" />
        <datalist id="doc-paths">{Object.keys(model.files || {}).map(path => <option key={path} value={path} />)}</datalist>
        {docType === "CHANGE_SUMMARY" && <select aria-label="Change period" value={period} onChange={event => setPeriod(event.target.value)} className="rounded border border-line p-2 text-xs"><option value="latest">Latest</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="range">Commit or release range</option></select>}
        {docType === "CHANGE_SUMMARY" && period === "range" && <><input aria-label="Before commit or tag" value={before} onChange={event => setBefore(event.target.value)} placeholder="Before SHA or local tag" className="rounded border border-line p-2 text-xs" /><input aria-label="After commit or tag" value={after} onChange={event => setAfter(event.target.value)} placeholder="After SHA or local tag" className="rounded border border-line p-2 text-xs" /></>}
        <button disabled={loading} onClick={() => run(selected())} className="rounded bg-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">{docType === "README_DRAFT" ? "Generate README Draft" : "Generate"}</button>
      </div>
      {loading && <p role="status" className="text-xs text-ink-secondary">Collecting bounded repository evidence…</p>}
      {(loading || document || error) && <LifecycleGraph type="documentation" status={loading ? "generating" : error ? "failed" : "completed"} compact />}
      {(error || actionError) && <p role="alert" className="text-xs text-rose-600">{error || actionError}</p>}
    </div>
    {document && <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <nav aria-label="Documentation contents" className="self-start rounded-2xl border border-line bg-surface p-4 lg:sticky lg:top-4"><h3 className="font-semibold text-ink">Contents</h3>{document.sections.map(part => <a key={part.id} href={`#doc-${part.id}`} onClick={event => { event.preventDefault(); onSelectSection?.(part.id); window.document.getElementById(`doc-${part.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" }) }} className="mt-2 block text-xs text-brand">{part.title}</a>)}</nav>
      <div className="space-y-4">
        <div className="rounded-2xl border border-line bg-surface p-5"><h3 className="text-lg font-bold text-ink">{document.title}</h3><p className="text-xs text-ink-secondary">Revision {document.repo_revision.slice(0, 10)} · {document.confidence} confidence · {document.cached ? "cached" : "generated"} · {document.llm_calls} AI calls</p>
          <div className="mt-3 flex flex-wrap gap-2">{(["markdown", "html", "json"] as const).map(format => <button key={format} onClick={() => void guarded(() => download(format))} className="rounded border border-line px-3 py-1 text-xs text-brand">Download {format === "markdown" ? ".md" : format === "html" ? ".html" : ".json"}</button>)}{projectId && <button onClick={save} className="rounded border border-line px-3 py-1 text-xs text-brand">Save to Project</button>}</div>{saved && <p role="status" className="mt-2 text-xs text-emerald-700">{saved}</p>}
          {document.warnings.map(item => <p key={item} className="mt-2 text-xs text-amber-700">{item}</p>)}
        </div>
          {document.type === "README_DRAFT" && <div className="grid gap-3 md:grid-cols-2"><div className="rounded-xl border border-line bg-surface p-4"><h4 className="font-semibold">Current README</h4><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs">{currentReadme || "Current README unavailable in source cache."}</pre></div><div className="rounded-xl border border-line bg-surface p-4"><h4 className="font-semibold">Generated draft</h4><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs">{readmeDraft}</pre></div><div className="flex gap-2"><button onClick={() => readmeDraft && void copy(readmeDraft)} className="text-xs text-brand">Copy draft</button>{readmePatchReady && currentReadme && readmeDraft && readmeDraft.length <= 20_000 && <button onClick={patchReadme} className="text-xs text-brand">Create Patch preview</button>}</div></div>}
        {document.sections.map(part => <article id={`doc-${part.id}`} key={part.id} className="scroll-mt-4 rounded-2xl border border-line bg-surface p-5 shadow-card space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-ink">{part.title}</h3><div className="flex gap-3 text-xs"><button onClick={() => void copy(localMarkdown(part.title, document.repo_revision, [part]))} className="text-brand">Copy section</button><button onClick={() => activeTarget && void guarded(() => regenerateSection(activeTarget, part.id))} className="text-brand">Regenerate section</button><button onClick={() => polish(part.id)} className="text-brand">Improve Writing with AI</button></div></div>
          {part.facts.map((value, index) => <p key={`f${index}`} className="text-sm text-ink"><strong className="text-emerald-700">FACT</strong> {value}</p>)}
          {part.inferences.map((value, index) => <p key={`i${index}`} className="text-sm text-ink"><strong className="text-amber-700">INFERENCE</strong> {value}</p>)}
          {part.unknowns.map((value, index) => <p key={`u${index}`} className="text-sm text-ink-secondary"><strong>UNKNOWN</strong> {value}</p>)}
          {part.diagram && <pre aria-label="Mermaid diagram source" className="overflow-auto rounded bg-surface-inset p-3 text-xs">{part.diagram}</pre>}
          {!!part.citations.length && <div className="flex flex-wrap gap-2 border-t border-line pt-3"><span className="text-xs text-ink-secondary">Sources:</span>{part.citations.map((ref, index) => <button key={`${ref.file}:${ref.start_line}:${index}`} onClick={() => onOpenSource({ path: ref.file, startLine: ref.start_line || undefined, endLine: ref.end_line || undefined })} className="text-xs text-brand underline">{ref.file}{ref.start_line ? `:${ref.start_line}` : ""}</button>)}</div>}
        </article>)}
        {aiPreview && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4"><strong className="text-sm">AI writing preview — review against the original facts and citations</strong><p className="mt-2 whitespace-pre-wrap text-sm">{aiPreview}</p></div>}
      </div>
    </div>}
  </section>
}
