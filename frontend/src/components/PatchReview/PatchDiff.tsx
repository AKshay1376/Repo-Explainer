import React from "react"
import type { PatchFile } from "../../types/patch"

export const UnifiedDiff: React.FC<{ diff: string; label: string; onNewLineClick?: (line: number) => void }> = ({ diff, label, onNewLineClick }) => {
  if (!onNewLineClick) return <pre aria-label={label} className="max-h-[30rem] overflow-auto rounded-lg bg-surface-inset p-3 text-[11px] leading-5 text-ink">{diff}</pre>
  let nextLine: number | null = null
  return <div aria-label={label} className="max-h-[30rem] overflow-auto rounded-lg bg-surface-inset p-3 font-mono text-[11px] leading-5 text-ink">{diff.split("\n").map((line, index) => {
    const header = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (header) nextLine = Number(header[1])
    const mapped = nextLine !== null && line.startsWith("+") && !line.startsWith("+++") ? nextLine : null
    if (nextLine !== null && (line.startsWith("+") && !line.startsWith("+++") || line.startsWith(" "))) nextLine += 1
    return <div key={index} className="whitespace-pre"><button type="button" disabled={mapped === null} onClick={() => mapped !== null && onNewLineClick(mapped)} className="mr-2 inline-block w-10 text-right text-brand disabled:text-ink-tertiary">{mapped ?? ""}</button>{line}</div>
  })}</div>
}

export const PatchDiff: React.FC<{ file: PatchFile; mode: "unified" | "side-by-side"; selected: string[] }> = ({ file, mode, selected }) => {
  if (mode === "unified") return <UnifiedDiff diff={file.unified_diff} label={`${file.path} unified diff`} />
  return <div aria-label={`${file.path} side-by-side diff`} className="max-h-[30rem] overflow-auto rounded-lg border border-line text-[11px] font-mono">
    <div className="grid grid-cols-2 border-b border-line bg-surface-inset font-semibold"><span className="p-2">Original</span><span className="border-l border-line p-2">Proposed</span></div>
    {file.hunks.filter((hunk) => selected.includes(`${file.path}:${hunk.id}`)).map((hunk) => <div key={hunk.id} className="grid grid-cols-2 border-b border-line">
      <pre className="overflow-auto whitespace-pre-wrap break-all bg-rose-50 p-2 text-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{hunk.original_lines.join("") || "(insertion)"}</pre>
      <pre className="overflow-auto whitespace-pre-wrap break-all border-l border-line bg-emerald-50 p-2 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{hunk.proposed_lines.join("") || "(deletion)"}</pre>
    </div>)}
  </div>
}
