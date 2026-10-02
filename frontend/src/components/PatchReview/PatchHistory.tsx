import React from "react"
import type { PatchHistoryItem } from "../../types/patch"

export const PatchHistory: React.FC<{ history: PatchHistoryItem[]; onOpen: (id: string) => void }> = ({ history, onOpen }) => <section className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-2" aria-label="Patch history">
  <h3 className="font-semibold text-ink">Patch history</h3>
  {!history.length && <p className="text-xs text-ink-tertiary">No local patches yet.</p>}
  {history.map((item) => <button key={item.id} onClick={() => onOpen(item.id)} className="block w-full rounded-lg border border-line p-2 text-left text-xs text-ink-secondary hover:border-brand-border">
    <span className="font-mono text-ink">{item.id.slice(0, 12)}</span> · {item.source} · {item.status} · {item.risk_level} · {item.validation?.state || "NOT_RUN"}<br />
    <span className="text-ink-tertiary">{item.created_at} · {item.files.join(", ")}</span>
  </button>)}
</section>
