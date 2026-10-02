import React from "react"

interface SourceSearchProps {
  query: string
  onQueryChange: (value: string) => void
  caseSensitive: boolean
  onCaseChange: (value: boolean) => void
  count: number
  activeIndex: number
  onPrevious: () => void
  onNext: () => void
}

export const SourceSearch: React.FC<SourceSearchProps> = ({
  query, onQueryChange, caseSensitive, onCaseChange, count, activeIndex, onPrevious, onNext,
}) => (
  <div className="flex flex-wrap items-center gap-2" role="search" aria-label="Search current file">
    <input
      value={query}
      onChange={(event) => onQueryChange(event.target.value)}
      placeholder="Search this file"
      aria-label="Search text"
      className="min-w-44 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink outline-none focus:border-brand"
    />
    <span className="text-xs text-ink-tertiary tabular-nums" aria-live="polite">
      {query ? `${count ? activeIndex + 1 : 0} of ${count}` : ""}
    </span>
    <button type="button" onClick={onPrevious} disabled={!count} className="rounded-lg border border-line px-2 py-1 text-xs disabled:opacity-40">Previous</button>
    <button type="button" onClick={onNext} disabled={!count} className="rounded-lg border border-line px-2 py-1 text-xs disabled:opacity-40">Next</button>
    <label className="flex items-center gap-1 text-xs text-ink-secondary">
      <input type="checkbox" checked={caseSensitive} onChange={(event) => onCaseChange(event.target.checked)} /> Case sensitive
    </label>
  </div>
)
