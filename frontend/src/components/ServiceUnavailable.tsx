import React from "react"

export function ServiceUnavailable({ retry }: { retry: () => void }) {
  return <main className="min-h-screen flex items-center justify-center bg-canvas text-ink p-8">
    <div className="max-w-md rounded-2xl border border-line bg-surface p-8 text-center space-y-4">
      <h1 className="text-xl font-semibold">Analysis service unavailable</h1>
      <p className="text-sm text-ink-secondary">Check that the backend is running, then retry.</p>
      <button onClick={retry} className="rounded-lg bg-brand px-4 py-2 text-white">Retry</button>
    </div>
  </main>
}
