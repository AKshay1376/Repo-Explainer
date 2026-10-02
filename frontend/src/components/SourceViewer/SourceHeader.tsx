import React from "react"
import type { SourceFile, SourceLocation } from "../../types/source"

interface SourceHeaderProps {
  file: SourceFile
  location: SourceLocation
  githubUrl: string
  copied: string | null
  onCopyPath: () => void
  onCopyLines: () => void
  onCopyReference: () => void
}

export const SourceHeader: React.FC<SourceHeaderProps> = ({
  file, location, githubUrl, copied, onCopyPath, onCopyLines, onCopyReference,
}) => (
  <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-4 sm:p-5">
    <div className="min-w-0">
      <h2 className="font-mono text-sm font-bold text-ink break-all">{file.path}</h2>
      <p className="mt-1 text-xs text-ink-tertiary">
        {file.language} · {file.line_count.toLocaleString()} lines · {file.size.toLocaleString()} bytes
        {location.startLine ? ` · L${location.startLine}${location.endLine && location.endLine > location.startLine ? `–${location.endLine}` : ""}` : ""}
      </p>
      {file.warning && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{file.warning}</p>}
    </div>
    <div className="flex flex-wrap gap-1.5 text-xs">
      <button type="button" onClick={onCopyPath} className="rounded-lg border border-line px-2.5 py-1.5 hover:border-brand-border">{copied === "path" ? "Copied" : "Copy path"}</button>
      <button type="button" onClick={onCopyLines} disabled={!location.startLine || !file.content} className="rounded-lg border border-line px-2.5 py-1.5 disabled:opacity-40 hover:border-brand-border">{copied === "lines" ? "Copied" : "Copy selected lines"}</button>
      <button type="button" onClick={onCopyReference} disabled={!location.startLine} className="rounded-lg border border-line px-2.5 py-1.5 disabled:opacity-40 hover:border-brand-border">{copied === "reference" ? "Copied" : "Copy path + lines"}</button>
      {!file.redacted && <a href={githubUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-brand-border bg-brand-surface px-2.5 py-1.5 text-brand">Open on GitHub ↗</a>}
    </div>
  </header>
)
