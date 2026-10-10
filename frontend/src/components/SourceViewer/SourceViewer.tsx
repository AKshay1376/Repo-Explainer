import React, { useEffect, useMemo, useRef, useState } from "react"
import type { RepositoryModel } from "../../types/repository"
import type { SourceLocation } from "../../types/source"
import type { PlanTrigger } from "../../types/refactor"
import type { PatchTrigger } from "../../types/patch"
import { useSourceFile } from "../../hooks/useSourceFile"
import { findSourceMatches, githubSourceUrl, parseSourceReference, selectLineRange } from "../../lib/sourceNavigation"
import { SourceCode } from "./SourceCode"
import { SourceHeader } from "./SourceHeader"
import { SourceOutline } from "./SourceOutline"
import { SourceSearch } from "./SourceSearch"
import { canCreatePatchFromSource } from "../../lib/patchSource"
import type { ValidatorResult } from "../../types/validators"
import type { BlameResponse } from "../../types/gitHistory"

interface SourceViewerProps {
  repoUrl: string
  model: RepositoryModel
  location: SourceLocation | null
  onNavigate: (location: SourceLocation) => void
  visible: boolean
  onHumanize?: (path: string) => void
  onCreatePlan?: (trigger: PlanTrigger) => void
  onCreatePatch?: (trigger: PatchTrigger) => void
  onViewHistory?: (path: string) => void
  onDocument?: (path: string, symbol?: string) => void
}

const scrollPositions = new Map<string, number>()

export const SourceViewer: React.FC<SourceViewerProps> = ({ repoUrl, model, location, onNavigate, visible, onHumanize, onCreatePlan, onCreatePatch, onViewHistory, onDocument }) => {
  const [pathInput, setPathInput] = useState("")
  const [query, setQuery] = useState("")
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [activeMatch, setActiveMatch] = useState(0)
  const [showGenerated, setShowGenerated] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [lastValidation, setLastValidation] = useState<ValidatorResult | null>(null)
  const [lineHistory, setLineHistory] = useState<BlameResponse | null>(null)
  const [lineHistoryError, setLineHistoryError] = useState("")
  const viewport = useRef<HTMLDivElement>(null)
  const lastNavigation = useRef<string>("")
  const historical = Boolean(location?.revision)
  const ref = location?.revision || model.metadata.latest_commit_sha || model.metadata.default_branch
  const path = location?.path || null
  const knownSymbol = historical ? null : model.symbols?.find((symbol) => symbol.file === path && symbol.line === location?.startLine)
  const { file, loading, error } = useSourceFile(repoUrl, path, ref, historical)
  const matches = useMemo(() => findSourceMatches(file?.content || "", query, caseSensitive), [file?.content, query, caseSensitive])
  const matchLines = useMemo(() => new Set(matches.map((match) => match.line)), [matches])

  useEffect(() => { setActiveMatch(0) }, [query, caseSensitive, path])
  useEffect(() => { setShowGenerated(false) }, [path])
  useEffect(() => { setLineHistory(null); setLineHistoryError("") }, [path, ref])
  useEffect(() => {
    if (!visible || !path) return
    let active = true
    if (historical) { setLastValidation(null); return }
    void fetch(`/api/validators/history?repo_url=${encodeURIComponent(repoUrl)}`)
      .then((response) => response.json())
      .then((result) => { if (active) setLastValidation((result.history || []).find((item: ValidatorResult) => item.paths?.includes(path)) || null) })
      .catch(() => { if (active) setLastValidation(null) })
    return () => { active = false }
  }, [visible, path, repoUrl, historical])
  useEffect(() => {
    if (!visible || !file || !viewport.current || !location || file.path !== location.path) return
    const navigationKey = `${location.path}|${location.requestId || 0}`
    const isNewNavigation = navigationKey !== lastNavigation.current
    lastNavigation.current = navigationKey
    const target = isNewNavigation && location.startLine ? Math.max(0, (location.startLine - 1) * 22 - 110) : (scrollPositions.get(`${repoUrl}|${ref}|${file.path}`) || 0)
    viewport.current.scrollTop = target
  }, [file, location?.requestId, location?.path, visible])

  const jump = (line: number) => {
    if (!location) return
    onNavigate({ ...location, startLine: line, endLine: line })
    if (viewport.current) viewport.current.scrollTop = Math.max(0, (line - 1) * 22 - 110)
  }
  const moveMatch = (direction: number) => {
    if (!matches.length) return
    const next = (activeMatch + direction + matches.length) % matches.length
    setActiveMatch(next)
    jump(matches[next].line)
  }
  const copy = async (kind: string, value: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 1800)
  }
  const selection = location?.startLine && file?.content
    ? file.content.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n").slice(location.startLine - 1, location.endLine || location.startLine).join("\n") : ""
  const reference = location?.startLine
    ? `${path}:${location.startLine}${location.endLine && location.endLine > location.startLine ? `-${location.endLine}` : ""}` : path || ""
  const invalidLine = !!(location?.startLine && file && location.startLine > file.line_count)
  const githubUrl = file && path ? githubSourceUrl(model, path, file.commit_sha || ref, location?.startLine, location?.endLine) : ""
  const showLineHistory = async () => {
    if (!path || !/^[0-9a-f]{7,64}$/i.test(ref)) return
    if (lineHistory) { setLineHistory(null); return }
    const start = location?.startLine || 1
    const end = Math.min(location?.endLine || start + 19, start + 199)
    try {
      const response = await fetch("/api/history/blame", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_url: repoUrl, sha: ref, path, start, end }) })
      const payload = await response.json()
      if (!response.ok || !payload.success) throw new Error(payload.error || "Line history unavailable.")
      setLineHistory(payload as BlameResponse)
      setLineHistoryError("")
    } catch (cause) { setLineHistoryError(cause instanceof Error ? cause.message : "Line history unavailable.") }
  }

  return <section className="rounded-3xl border border-line bg-surface shadow-card overflow-hidden" aria-label="Source code viewer">
    <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
      <h2 className="mr-auto text-sm font-semibold text-ink">Source Code Viewer</h2>
      {path && file && !file.is_sensitive && onViewHistory && <button type="button" onClick={() => onViewHistory(path)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-brand">View History</button>}
      {path && file && !file.is_sensitive && !historical && onDocument && <button type="button" onClick={() => onDocument(path)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-brand">Document File</button>}
      {path && knownSymbol && !historical && onDocument && <button type="button" onClick={() => onDocument(path, knownSymbol.name)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-brand">Document Symbol</button>}
      {path && file && !file.is_sensitive && !file.is_binary && /^[0-9a-f]{7,64}$/i.test(ref) && <button type="button" onClick={() => void showLineHistory()} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-brand">{lineHistory ? "Hide Line History" : "Show Line History"}</button>}
      {!historical && path && file && !file.is_sensitive && !file.is_binary && onCreatePlan && <button type="button" onClick={() => onCreatePlan({ planType: "move_file", target: path })} className="rounded-lg border border-brand-border bg-brand-surface px-3 py-1.5 text-xs font-semibold text-brand">Plan refactor</button>}
      {!historical && path && file && !file.is_sensitive && !file.is_binary && onHumanize && <button type="button" onClick={() => onHumanize(path)} className="rounded-lg border border-brand-border bg-brand-surface px-3 py-1.5 text-xs font-semibold text-brand">Humanize</button>}
      {!historical && path && canCreatePatchFromSource(file) && onCreatePatch && <button type="button" onClick={() => onCreatePatch({ source: "selection", path, startLine: location?.startLine || 1, endLine: location?.endLine || location?.startLine || 1, transformation: "trim_trailing_whitespace" })} className="rounded-lg border border-brand-border bg-brand-surface px-3 py-1.5 text-xs font-semibold text-brand">Create Patch</button>}
      {!historical && path && knownSymbol && canCreatePatchFromSource(file) && onCreatePatch && <button type="button" onClick={() => onCreatePatch({ source: "selection", path, startLine: knownSymbol.line || 1, endLine: knownSymbol.line || 1, transformation: "trim_trailing_whitespace" })} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-brand">Patch symbol {knownSymbol.name}</button>}
      <form className="flex min-w-60 flex-1 gap-2 sm:max-w-xl" onSubmit={(event) => {
        event.preventDefault()
        const selected = pathInput.trim().replace(/\\/g, "/")
        if (selected) onNavigate({ ...(parseSourceReference(selected) || { path: selected }), requestId: Date.now() })
      }}>
        <input value={pathInput} onChange={(event) => setPathInput(event.target.value)} list="source-paths" placeholder="Enter a repository file path" aria-label="Repository file path" className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink" />
        <datalist id="source-paths">{Object.keys(model.files || {}).map((item) => <option key={item} value={item} />)}</datalist>
        <button type="submit" className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white">Open</button>
      </form>
    </div>
    {!path ? <p className="p-8 text-sm text-ink-secondary">Choose a file to view its source.</p>
      : loading ? <p className="p-8 text-sm text-ink-secondary">Loading source…</p>
      : error ? <div className="p-8 text-sm text-rose-600" role="alert">{error}</div>
      : file && location ? <>
        {historical && <p className="border-b border-line bg-amber-50 px-5 py-2 text-xs font-semibold text-amber-900">Read-only historical source at commit {ref.slice(0, 8)}. Patch, Humanize apply, and refactor actions are disabled; current line mapping is unavailable.</p>}
        <SourceHeader file={file} location={location} githubUrl={githubUrl} copied={copied}
          onCopyPath={() => copy("path", file.path)} onCopyLines={() => copy("lines", selection)} onCopyReference={() => copy("reference", reference)} />
        {!historical && <p className="px-5 py-2 text-xs text-ink-secondary">Validation status: {lastValidation ? `${lastValidation.state} · ${lastValidation.command_id} · ${lastValidation.timestamp}` : "Not run for this file"}</p>}
        {lineHistoryError && <p role="alert" className="px-5 py-2 text-xs text-amber-700">{lineHistoryError}</p>}
        {lineHistory && <div className="max-h-40 overflow-auto border-b border-line px-5 py-2 text-xs"><strong className="text-ink">Line origins · commit / author / date / subject</strong>{lineHistory.lines.map(item => <p key={`${item.line}:${item.sha}`} className="font-mono text-ink-secondary">L{item.line} · {item.sha.slice(0, 8)} · {item.author_name} · {new Date(item.author_time * 1000).toLocaleDateString()} · {item.subject}</p>)}</div>}
        {invalidLine && <p className="px-5 py-2 text-xs text-amber-600">Requested line {location.startLine} is outside this file ({file.line_count} lines).</p>}
        {file.redacted && !file.is_sensitive && <p className="px-5 py-2 text-xs text-amber-600">Some sensitive values in this file were redacted before display.</p>}
        {file.is_sensitive ? <p className="p-8 text-sm text-ink-secondary">This sensitive file is redacted. Its contents cannot be displayed or copied.</p>
          : file.is_binary ? <p className="p-8 text-sm text-ink-secondary">Binary file. Source preview is unavailable.</p>
          : file.is_generated && !showGenerated ? <div className="p-8 text-sm text-ink-secondary">This file appears to be generated and may be large. <button className="ml-2 rounded-lg border border-line px-3 py-1.5 text-brand" onClick={() => setShowGenerated(true)}>Show generated source</button></div>
          : file.content !== null ? <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_240px]">
            <div className="min-w-0 space-y-3">
              <SourceSearch query={query} onQueryChange={setQuery} caseSensitive={caseSensitive} onCaseChange={setCaseSensitive} count={matches.length} activeIndex={activeMatch} onPrevious={() => moveMatch(-1)} onNext={() => moveMatch(1)} />
              <SourceCode content={file.content} language={file.language} startLine={location.startLine} endLine={location.endLine} searchLines={matchLines} viewportRef={viewport}
                onScrollPosition={(top) => scrollPositions.set(`${repoUrl}|${ref}|${file.path}`, top)} onLineClick={(line, shift) => onNavigate(selectLineRange(location, line, shift))} />
              <p className="text-xs text-ink-tertiary">Click a line number to select it; Shift-click to select a range. This viewer is read-only.</p>
            </div>
            {!historical && <SourceOutline model={model} path={file.path} onJump={jump} />}
          </div> : <p className="p-8 text-sm text-ink-secondary">Source content is unavailable.</p>}
      </> : null}
  </section>
}
