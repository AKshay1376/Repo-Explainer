import React, { useEffect, useState } from "react"
import { apiFetch } from "../apiClient"
import { localApi } from "../hooks/useProjects"
import { useTheme } from "../lib/theme"
import type { Settings } from "../types/persistence"
import { AccessibleDialog } from "./ui/AccessibleDialog"

export function SettingsDialog({ onClose, capabilities, onResetOnboarding }: {
  onClose: () => void; capabilities: Record<string, boolean>; onResetOnboarding: () => void
}) {
  const { theme, setThemeMode } = useTheme()
  const [density, setDensity] = useState(() => typeof localStorage === "undefined" ? "comfortable" : localStorage.getItem("workspace-density") || "comfortable")
  const [settings, setSettings] = useState<Settings | null>(null)
  const [version, setVersion] = useState<{ version?: string; environment?: string } | null>(null)
  const [size, setSize] = useState<number | null>(null)
  const [notice, setNotice] = useState("")
  useEffect(() => {
    void localApi<{ settings: Settings }>("/settings").then(value => setSettings(value.settings)).catch(() => undefined)
    void localApi<{ storage: { size_bytes: number } }>("/storage").then(value => setSize(value.storage.size_bytes)).catch(() => undefined)
    void apiFetch("/api/version").then(response => response.json()).then(setVersion).catch(() => undefined)
  }, [])
  const update = async (key: keyof Settings, value: Settings[keyof Settings]) => {
    try { const result = await localApi<{ settings: Settings }>("/settings", "PATCH", { [key]: value }); setSettings(result.settings); setNotice("Setting saved.") }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "Could not save setting.") }
  }
  const exportData = async () => {
    try {
      const result = await localApi<{ data: unknown }>("/local-data/export")
      const url = URL.createObjectURL(new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" }))
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "repo-explainer-local-data.json"; anchor.click(); URL.revokeObjectURL(url)
      setNotice("Local data exported.")
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Export failed.") }
  }
  const importData = async (file: File) => {
    try {
      if (file.size > 10_000_000) throw new Error("Local data file is too large.")
      const result = await localApi<{ imported_projects: number }>("/local-data/import", "POST", JSON.parse(await file.text()))
      setNotice(`Imported ${result.imported_projects} projects. Refresh the home page to see them.`)
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Import failed.") }
  }
  const chooseDensity = (value: string) => {
    setDensity(value); localStorage.setItem("workspace-density", value)
    document.documentElement.classList.toggle("compact-density", value === "compact")
  }

  return <AccessibleDialog title="Settings and About" onClose={onClose} className="max-w-2xl">
    <div className="space-y-6 text-sm text-ink">
      <section><h3 className="mb-2 font-semibold">Appearance</h3>
        <label className="mr-5">Theme <select aria-label="Theme" value={theme} onChange={event => setThemeMode(event.target.value as "system" | "light" | "dark")} className="ml-2 rounded border border-line bg-surface p-1"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <label>Density <select aria-label="Density" value={density} onChange={event => chooseDensity(event.target.value)} className="ml-2 rounded border border-line bg-surface p-1"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
      </section>
      <section><h3 className="mb-2 font-semibold">Behavior</h3>{settings ? <div className="space-y-2">
        <label className="block"><input type="checkbox" checked={settings.remember_workspace} onChange={event => void update("remember_workspace", event.target.checked)} /> Remember workspace</label>
        <label className="block"><input type="checkbox" checked={settings.auto_open_last_project} onChange={event => void update("auto_open_last_project", event.target.checked)} /> Auto-open last project</label>
        <label className="block">Landing page <select value={settings.default_landing_page} onChange={event => void update("default_landing_page", event.target.value as Settings["default_landing_page"])} className="ml-2 rounded border border-line bg-surface p-1"><option value="home">Home</option><option value="last_project">Last project</option></select></label>
      </div> : <p className="text-ink-secondary">Local preferences are unavailable.</p>}</section>
      <section><h3 className="mb-2 font-semibold">Keyboard shortcuts</h3><p className="text-ink-secondary">Ctrl/Cmd+K commands · Ctrl/Cmd+P quick open · Ctrl/Cmd+Shift+F repository search · Alt+Left/Right history · ? help</p></section>
      <section><h3 className="mb-2 font-semibold">Persistence and privacy</h3>
        {settings && <label className="block"><input type="checkbox" checked={settings.persist_ask_history} onChange={event => void update("persist_ask_history", event.target.checked)} /> Allow Ask Repo history storage</label>}
        <p className="mt-2 text-ink-secondary">Internal product events are disabled by default. No third-party analytics are loaded.</p>
        <p className="mt-2 text-ink-secondary">Local database: {size === null ? "unavailable" : `${Math.ceil(size / 1024)} KB`}</p>
        <button onClick={() => void exportData()} className="mt-2 rounded border border-line px-3 py-1.5 text-brand">Export local data</button>
        <label className="ml-3 cursor-pointer text-brand">Import local data<input type="file" accept="application/json,.json" className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) void importData(file) }} /></label>
      </section>
      <section><h3 className="mb-2 font-semibold">Validation and advanced</h3><p className="text-ink-secondary">Validator execution: {capabilities.validator_execution === false ? "Unavailable" : "Available"} · Local filesystem: {capabilities.local_filesystem === false ? "Unavailable" : "Available"} · Patch apply: {capabilities.patch_apply === false ? "Unavailable" : "Available"}</p>
        {settings && <div className="mt-2 flex flex-wrap gap-3">{(["activity_limit", "analysis_limit", "validation_limit"] as const).map(key => <label key={key}>{key.replace(/_/g, " ")} <input aria-label={key.replace(/_/g, " ")} type="number" min="10" max="1000" value={settings[key]} onChange={event => void update(key, Number(event.target.value))} className="ml-1 w-20 rounded border border-line bg-surface p-1" /></label>)}</div>}
      </section>
      <section><h3 className="mb-2 font-semibold">Help and About</h3><p className="text-ink-secondary">Repo Explainer {version?.version || "local"} · {version?.environment || "local"} deployment · <a href="https://github.com/AKshay1376/Repo-Explainer" target="_blank" rel="noreferrer" className="text-brand underline">Project repository</a></p>
        <button onClick={onResetOnboarding} className="mt-2 text-brand underline">Show onboarding again</button>
      </section>
      {notice && <p role="status" className="rounded border border-line bg-surface-inset p-2">{notice}</p>}
    </div>
  </AccessibleDialog>
}
