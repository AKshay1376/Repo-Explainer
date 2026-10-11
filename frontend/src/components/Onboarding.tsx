import React from "react"
import { AccessibleDialog } from "./ui/AccessibleDialog"

export function Onboarding({ onClose }: { onClose: () => void }) {
  return <AccessibleDialog title="Welcome to Repo Explainer" onClose={onClose} className="max-w-2xl">
    <p className="text-sm text-ink-secondary">Get from a repository URL to an evidence-backed understanding of its code.</p>
    <ol className="mt-5 grid gap-3 sm:grid-cols-3">
      <li className="rounded-xl border border-line bg-surface-inset p-4"><span className="text-xs font-bold text-brand">01 · CONNECT</span><h3 className="mt-2 font-semibold">Open a repository</h3><p className="mt-1 text-xs text-ink-secondary">Paste its GitHub URL or resume a saved project.</p></li>
      <li className="rounded-xl border border-line bg-surface-inset p-4"><span className="text-xs font-bold text-brand">02 · UNDERSTAND</span><h3 className="mt-2 font-semibold">Explore the code</h3><p className="mt-1 text-xs text-ink-secondary">Use Architecture, Source, Execution, and Ask Repo to follow evidence.</p></li>
      <li className="rounded-xl border border-line bg-surface-inset p-4"><span className="text-xs font-bold text-brand">03 · CHANGE SAFELY</span><h3 className="mt-2 font-semibold">Plan before applying</h3><p className="mt-1 text-xs text-ink-secondary">Check Impact, preview a patch, then validate and review the result.</p></li>
    </ol>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-ink-tertiary">You can reopen this from Settings.</p><div className="flex gap-2"><button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">Skip</button><button onClick={onClose} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">Get started</button></div></div>
  </AccessibleDialog>
}
