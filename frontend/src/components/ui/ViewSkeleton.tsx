import React from "react"

export function ViewSkeleton({ title }: { title: string }) {
  return <section role="status" aria-label={`Loading ${title}`} className="rounded-2xl border border-line bg-surface p-6 shadow-card">
    <p className="mb-5 text-sm font-semibold text-ink">Loading {title}…</p>
    <div aria-hidden="true" className="space-y-4 opacity-60">
      <div className="h-4 w-1/3 rounded bg-surface-inset" />
      <div className="h-3 w-full rounded bg-surface-inset" />
      <div className="h-3 w-4/5 rounded bg-surface-inset" />
      <div className="grid gap-3 sm:grid-cols-3"><div className="h-24 rounded bg-surface-inset" /><div className="h-24 rounded bg-surface-inset" /><div className="h-24 rounded bg-surface-inset" /></div>
    </div>
  </section>
}
