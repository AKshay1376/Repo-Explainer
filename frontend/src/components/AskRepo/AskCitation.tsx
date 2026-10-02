/**
 * components/AskRepo/AskCitation.tsx
 * Interactive citation pill linking grounded answers to FileInspector and ArchitectureGraph.
 */

import React from "react"
import type { SourceLocation } from "../../types/source"
import type { AskCitation as AskCitationType } from "../../types/qa"
import { FileCodeIcon, ExternalLinkIcon, LayersIcon } from "../ui/icons"

interface AskCitationProps {
  citation: AskCitationType
  onInspectFile?: (filePath: string) => void
  onShowInGraph?: (filePath: string) => void
  onOpenSource?: (location: SourceLocation) => void
}

export const AskCitation: React.FC<AskCitationProps> = ({
  citation,
  onInspectFile,
  onShowInGraph,
  onOpenSource,
}) => {
  const fileName = citation.file.split("/").pop() || citation.file
  const hasLine = citation.line != null

  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-brand-border/40 bg-brand-surface/60 px-2.5 py-1 text-xs text-ink transition-colors hover:border-brand-border group">
      <FileCodeIcon className="h-3.5 w-3.5 text-brand shrink-0" strokeWidth={1.75} />
      <span className="font-mono font-medium truncate max-w-[180px] sm:max-w-[240px]" title={citation.file}>
        {fileName}
        {hasLine && <span className="text-brand font-semibold">:L{citation.line}</span>}
      </span>

      <span className="flex items-center gap-1 ml-1 shrink-0">
        {onOpenSource && <button onClick={() => onOpenSource({ path: citation.file, ...(citation.line ? { startLine: citation.line, endLine: citation.line } : {}) })} className="text-[10px] uppercase font-semibold text-brand hover:underline">Source</button>}
        {onInspectFile && (
          <button
            onClick={() => onInspectFile(citation.file)}
            className="text-[10px] uppercase font-semibold text-brand hover:text-brand-hover hover:underline cursor-pointer px-1 py-0.5 rounded bg-surface/50"
            title={`Inspect ${citation.file}`}
          >
            Inspect
          </button>
        )}

        {onShowInGraph && (
          <button
            onClick={() => onShowInGraph(citation.file)}
            className="text-[10px] uppercase font-semibold text-ink-secondary hover:text-ink hover:underline cursor-pointer p-0.5 rounded hover:bg-surface/50"
            title={`Find ${citation.file} in Architecture Graph`}
          >
            <LayersIcon className="h-3 w-3 text-ink-tertiary group-hover:text-brand" />
          </button>
        )}
      </span>
    </span>
  )
}
