import React from "react"
import type { PatchFile } from "../../types/patch"
import { toggleFile, toggleHunk } from "../../lib/patchSelection"

export const PatchFileList: React.FC<{ files: PatchFile[]; selected: string[]; onChange: (ids: string[]) => void }> = ({ files, selected, onChange }) => <div className="space-y-2">
  {files.map((file) => {
    const ids = file.hunks.map((hunk) => `${file.path}:${hunk.id}`)
    const all = ids.every((id) => selected.includes(id))
    return <div key={file.path} className="rounded-xl border border-line bg-surface-inset p-3 space-y-2">
      <label className="flex items-center gap-2 text-xs font-semibold text-ink"><input type="checkbox" checked={all} onChange={() => onChange(toggleFile(selected, file))} />
        <span className="break-all font-mono">{file.path}{file.operation === "move" ? ` → ${file.destination_path}` : ""}</span><span className="ml-auto shrink-0 text-ink-tertiary">{file.operation || "modify"} · {file.confidence || "HIGH"} confidence · {file.risk_level} risk</span></label>
      {file.hunks.map((hunk) => {
        const id = `${file.path}:${hunk.id}`
        return <label key={id} className="flex items-start gap-2 pl-5 text-xs text-ink-secondary"><input type="checkbox" checked={selected.includes(id)} onChange={() => onChange(toggleHunk(selected, id, file))} />
          <span>{hunk.id}: old {hunk.old_start} ({hunk.old_count}) → new {hunk.new_start} ({hunk.new_count}) · {hunk.reason} · {hunk.confidence} confidence{hunk.depends_on.length ? ` · depends on ${hunk.depends_on.join(", ")}` : ""}</span></label>
      })}
      {file.public_api_change && <p className="pl-5 text-xs text-amber-700">Public API acknowledgement required.</p>}
    </div>
  })}
</div>
