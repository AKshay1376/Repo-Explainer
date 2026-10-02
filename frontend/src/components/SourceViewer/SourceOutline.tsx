import React from "react"
import type { RepositoryModel } from "../../types/repository"

interface SourceOutlineProps {
  model: RepositoryModel
  path: string
  onJump: (line: number) => void
}

const types = new Set(["class", "function", "method", "component", "hook", "variable", "constant"])

export const SourceOutline: React.FC<SourceOutlineProps> = ({ model, path, onJump }) => {
  const normalized = path.replace(/\\/g, "/")
  const symbols = (model.symbols || [])
    .filter((symbol) => symbol.file.replace(/\\/g, "/") === normalized && types.has(symbol.type) &&
      typeof symbol.line === "number" && symbol.line > 0)
    .sort((a, b) => (a.line || 0) - (b.line || 0))
  return (
    <aside className="rounded-xl border border-line bg-surface p-3 max-h-[560px] overflow-auto" aria-label="Symbol outline">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary mb-3">Symbols ({symbols.length})</h3>
      {symbols.length ? symbols.map((symbol, index) => (
        <button
          key={`${symbol.name}-${symbol.line}-${index}`}
          type="button"
          onClick={() => onJump(symbol.line!)}
          className="w-full flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-brand-surface hover:text-brand"
          title={`${symbol.type} ${symbol.name}, line ${symbol.line}`}
        >
          <span className="min-w-0 truncate"><span className="text-ink-tertiary mr-1">{symbol.type}</span>{symbol.name}</span>
          <span className="font-mono text-ink-tertiary">{symbol.line}</span>
        </button>
      )) : <p className="text-xs text-ink-tertiary">No symbols with known lines for this file.</p>}
    </aside>
  )
}
