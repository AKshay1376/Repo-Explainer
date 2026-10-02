import React from "react"

interface Props {
  patchId: string
  files: string[]
  rolledBackFiles?: string[]
  selected: string[]
  onSelected: (paths: string[]) => void
  confirmConflict: boolean
  onConflict: (value: boolean) => void
  onRollback: () => void
  loading: boolean
  saved?: boolean
}

export const RollbackPanel: React.FC<Props> = ({ patchId, files, rolledBackFiles, selected, onSelected,
  confirmConflict, onConflict, onRollback, loading, saved = false }) => <section aria-label="Rollback patch" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:bg-amber-950/20 dark:text-amber-200 space-y-2">
  <strong>Rollback available · {patchId.slice(0, 12)}</strong>
  <p>Restores exact original bytes. Select files to restore; changed files require explicit conflict approval.</p>
  {files.filter((path) => !rolledBackFiles?.includes(path)).map((path) => <label key={path} className="flex gap-2"><input type="checkbox" checked={selected.includes(path)} onChange={() => onSelected(selected.includes(path) ? selected.filter((item) => item !== path) : [...selected, path])} /> {path}</label>)}
  <label className="flex gap-2"><input type="checkbox" checked={confirmConflict} onChange={(event) => onConflict(event.target.checked)} /> Allow overwrite if files changed since apply</label>
  <button disabled={loading || !selected.length} onClick={onRollback} className="rounded-lg border border-amber-600 px-3 py-1.5 font-semibold">{saved ? "Rollback saved patch" : "Rollback selected files"}</button>
</section>
