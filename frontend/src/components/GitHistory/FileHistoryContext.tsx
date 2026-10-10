import React, { useEffect, useState } from "react"
import type { FileHistory } from "../../types/gitHistory"

export const FileHistoryContext: React.FC<{ repoUrl: string; path: string; onViewHistory?: (path: string) => void }> = ({ repoUrl, path, onViewHistory }) => {
  const [history, setHistory] = useState<FileHistory | null>(null)
  useEffect(() => {
    if (!path) { setHistory(null); return }
    const controller = new AbortController()
    fetch("/api/history/file", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_url: repoUrl, path, limit: 5 }), signal: controller.signal })
      .then(async response => { const value = await response.json(); return response.ok && value.success ? value as FileHistory : null })
      .then(value => { if (!controller.signal.aborted) setHistory(value) })
      .catch(() => { if (!controller.signal.aborted) setHistory(null) })
    return () => controller.abort()
  }, [repoUrl, path])
  if (!history?.total_commits) return null
  const latest = history.recent_commits[0]
  return <div className="rounded-xl border border-line bg-surface-inset p-3 text-xs text-ink-secondary">
    <strong className="text-ink">Change History</strong>: {history.total_commits} known commits{history.partial ? " (bounded)" : ""}; latest {latest ? new Date(latest.author_date).toLocaleString() : "unknown"}.
    {history.contributors[0] && <span> Frequent contributor: {history.contributors[0].author_name} ({history.contributors[0].share_percent}% of known commits).</span>}
    {onViewHistory && <button onClick={() => onViewHistory(path)} className="ml-2 font-semibold text-brand">Open History</button>}
  </div>
}
