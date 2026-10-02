import React, { useEffect, useState } from "react"
import { stageGraph, type ValidatorProfile, type ValidatorResult } from "../../types/validators"

interface Props { repoUrl: string; paths?: string[]; patchId?: string; compact?: boolean;
  initialProfile?: ValidatorProfile | null; initialHistory?: ValidatorResult[] }

const post = async <T,>(path: string, body: object): Promise<T> => {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const result = await response.json()
  if (!response.ok || !result.success) throw new Error(result.error || "Validator request failed")
  return result as T
}

export const ValidationView: React.FC<Props> = ({ repoUrl, paths = [], patchId = "", compact = false,
  initialProfile = null, initialHistory = [] }) => {
  const [profile, setProfile] = useState<ValidatorProfile | null>(initialProfile)
  const [history, setHistory] = useState<ValidatorResult[]>(initialHistory)
  const [selected, setSelected] = useState<string[]>([])
  const [results, setResults] = useState<ValidatorResult[]>([])
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const refresh = async () => {
    const [p, h] = await Promise.all([
      fetch(`/api/validators/profile?repo_url=${encodeURIComponent(repoUrl)}`).then((response) => response.json()),
      fetch(`/api/validators/history?repo_url=${encodeURIComponent(repoUrl)}`).then((response) => response.json()),
    ])
    if (!p.success) throw new Error(p.error || "Validation profile unavailable")
    setProfile(p.profile); setHistory(h.history || [])
  }
  useEffect(() => { void refresh().catch((cause) => setError(String(cause))) }, [repoUrl])
  const perform = async (action: "detect" | "trust" | "run", scope?: "trusted_once" | "trusted_repo") => {
    setBusy(true); setError("")
    try {
      const ids = selected.length ? selected : profile?.commands.map((item) => item.id) || []
      if (action === "detect") await post("/api/validators/detect", { repo_url: repoUrl })
      if (action === "trust") await post("/api/validators/trust", { repo_url: repoUrl, scope, command_ids: ids, confirm_trust: true })
      if (action === "run") {
        const response = await post<{ results: ValidatorResult[] }>("/api/validators/run", {
          repo_url: repoUrl, command_ids: ids, patch_id: patchId, paths,
        })
        setResults(response.results)
      }
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Validation failed") }
    finally { setBusy(false) }
  }
  const visibleHistory = paths.length ? history.filter((item) => item.paths?.some((path) => paths.includes(path))) : history
  return <section aria-label="Validation" className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-4">
    <div className="flex items-center justify-between gap-3"><div><h2 className="font-bold text-ink">Validation</h2>
      <p className="text-xs text-ink-secondary">Detected commands never run until you explicitly trust this local repository profile.</p></div>
      <button onClick={() => void perform("detect")} disabled={busy} className="text-xs font-semibold text-brand">Detect again</button></div>
    {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
    {!profile ? <p className="text-xs text-ink-secondary">Loading validation profile…</p> : <>
      <p className="text-xs text-ink-secondary">Detected stack: {profile.detected_stack.join(", ") || "unknown"} · Status: <strong>{profile.trust_scope.toUpperCase()}</strong></p>
      {profile.warnings.map((warning) => <p key={warning} className="text-xs text-amber-700">{warning}</p>)}
      <div className="space-y-2" aria-label="Review Commands">{profile.commands.map((command) => <label key={command.id} className="flex items-start gap-2 rounded-lg border border-line p-2 text-xs text-ink-secondary">
        <input type="checkbox" checked={selected.includes(command.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, command.id] : current.filter((id) => id !== command.id))} />
        <span><strong className="text-ink">{command.label}</strong> · {command.kind} · {command.confidence} confidence · {command.trusted ? "trusted" : "untrusted"}<br />
          <code>{command.command.join(" ")}</code> · {command.working_directory} · {command.source}</span></label>)}</div>
      {profile.commands.length === 0 && <p className="text-xs text-ink-secondary">No allowlisted validator commands were detected.</p>}
      <div className="flex flex-wrap gap-2 text-xs"><button disabled={busy || !selected.length} onClick={() => void perform("trust", "trusted_once")} className="rounded-lg border border-brand-border px-3 py-2 font-semibold text-brand disabled:opacity-40">Trust Once</button>
        <button disabled={busy || !selected.length} onClick={() => void perform("trust", "trusted_repo")} className="rounded-lg border border-brand-border px-3 py-2 font-semibold text-brand disabled:opacity-40">Trust Repository</button>
        <button disabled={busy || !selected.length || selected.some((id) => !profile.commands.find((item) => item.id === id)?.trusted)} onClick={() => void perform("run")} className="rounded-lg bg-brand px-3 py-2 font-semibold text-white disabled:opacity-40">Run Selected</button></div>
      <div className="flex flex-wrap gap-2" aria-label="Validation stages">{stageGraph(profile, results.length ? results : visibleHistory).map((item) => <span key={item.name} className="rounded-full bg-surface-inset px-2 py-1 text-[11px] text-ink-secondary">{item.name}: {item.state}</span>)}</div>
      {results.map((item) => <div key={item.timestamp + item.command_id} className="rounded-lg bg-surface-inset p-2 text-xs text-ink-secondary"><strong>{item.command_id}: {item.state}</strong> · {item.duration_seconds}s · exit {item.exit_code ?? "timeout"}<pre className="max-h-36 overflow-auto whitespace-pre-wrap">{item.output_summary}</pre></div>)}
      {!compact && <details><summary className="cursor-pointer text-xs font-semibold text-brand">Validation history ({visibleHistory.length})</summary>
        {visibleHistory.slice(0, 20).map((item) => <p key={item.timestamp + item.command_id} className="text-xs text-ink-secondary">{item.timestamp}: {item.command_id} · {item.state} · {item.duration_seconds}s</p>)}</details>}
    </>}
  </section>
}
