import React, { useState } from "react"
import { AccessibleDialog } from "./ui/AccessibleDialog"

export function HomeCommands({ onClose, onSettings, onHome }: { onClose: () => void; onSettings: () => void; onHome: () => void }) {
  const [query, setQuery] = useState("")
  const commands = [
    { label: "Open repository", run: () => { onHome(); window.setTimeout(() => document.querySelector<HTMLInputElement>("[aria-label='Repository URL']")?.focus(), 50) } },
    { label: "Switch project", run: () => { onHome(); window.setTimeout(() => document.querySelector<HTMLInputElement>("[aria-label='Search projects']")?.focus(), 50) } },
    { label: "Open settings", run: onSettings },
  ].filter(item => item.label.toLowerCase().includes(query.toLowerCase()))
  return <AccessibleDialog title="Command palette" onClose={onClose} className="max-w-lg">
    <input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && commands[0]) { onClose(); commands[0].run() } }}
      aria-label="Search commands" placeholder="Type a command…" className="w-full rounded-lg border border-line bg-canvas p-3 text-sm" />
    <div className="mt-3 space-y-1">{commands.map(command => <button key={command.label} onClick={() => { onClose(); command.run() }} className="block w-full rounded-lg p-2 text-left text-sm text-ink hover:bg-brand-soft">{command.label}</button>)}
      {!commands.length && <p className="p-2 text-sm text-ink-secondary">No matching command.</p>}</div>
    <p className="mt-3 text-xs text-ink-tertiary">Ctrl/Cmd+K opens this palette · Escape closes it</p>
  </AccessibleDialog>
}
