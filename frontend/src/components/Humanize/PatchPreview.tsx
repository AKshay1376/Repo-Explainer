import React, { useState } from "react"
import type { HumanizePreview } from "../../types/humanize"

interface PatchPreviewProps { preview: HumanizePreview; path: string }

export const PatchPreview: React.FC<PatchPreviewProps> = ({ preview, path }) => {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(preview.patch)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }
  const download = () => {
    const blob = new Blob([preview.patch], { type: "text/x-diff;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${path.replace(/[^a-z0-9._-]+/gi, "-")}-${preview.id}.patch`
    anchor.click()
    URL.revokeObjectURL(url)
  }
  return <details className="rounded-xl border border-line bg-surface-inset p-3">
    <summary className="cursor-pointer text-sm font-semibold text-ink">{preview.title} <span className="ml-2 text-xs font-normal text-ink-tertiary">{preview.risk_level} risk · preview only</span></summary>
    {preview.description && <p className="mt-2 text-xs text-ink-secondary">{preview.description}</p>}
    <p className="mt-2 text-xs text-ink-tertiary">Review the patch before applying it manually. No repository files were changed.</p>
    <pre aria-label={`${preview.title} patch`} className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface p-3 text-[11px] leading-5 text-ink">{preview.patch}</pre>
    <div className="mt-3 flex gap-2">
      <button type="button" onClick={copy} className="rounded-lg border border-line px-3 py-1.5 text-xs text-brand">{copied ? "Copied" : "Copy patch"}</button>
      <button type="button" onClick={download} className="rounded-lg border border-line px-3 py-1.5 text-xs text-brand">Download patch</button>
    </div>
  </details>
}
