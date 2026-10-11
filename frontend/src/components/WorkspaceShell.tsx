import React, { useEffect, useMemo, useState } from "react"
import type { RepositoryModel, SymbolModel } from "../types/repository"
import { availableViews, fileMatches, symbolMatches, VIEW_GROUPS, VIEW_LABELS, type WorkspaceLocation, type WorkspaceView } from "../lib/workspaceNavigation"
import { AccessibleDialog } from "./ui/AccessibleDialog"
import { CodeIcon, FileCodeIcon, FolderTreeIcon, GitBranchIcon, LayersIcon, MenuIcon, MessageSquareIcon, SearchIcon, XIcon, WorkflowIcon, ZapIcon } from "./ui/icons"

type Command = { id: string; label: string; description?: string; run: () => void; enabled?: boolean }
type PaletteMode = "commands" | "files" | "search" | null

const icons: Record<WorkspaceView, React.FC<{ className?: string }>> = {
  explorer: FolderTreeIcon, graph: LayersIcon, source: CodeIcon, flow: WorkflowIcon, ask: MessageSquareIcon,
  impact: ZapIcon, humanize: CodeIcon, health: ZapIcon, history: GitBranchIcon, refactor: WorkflowIcon,
  patch: FileCodeIcon, validation: ZapIcon, docs: FileCodeIcon, report: FileCodeIcon, project: FolderTreeIcon,
}

export interface WorkspaceShellProps {
  location: WorkspaceLocation
  model?: RepositoryModel
  projectId?: string | null
  repoName: string
  branch: string
  sha?: string | null
  capabilities: Record<string, boolean>
  canBack: boolean
  canForward: boolean
  onBack: () => void
  onForward: () => void
  onNavigate: (view: WorkspaceView) => void
  onOpenFile: (path: string, view: WorkspaceView) => void
  onOpenSymbol: (symbol: SymbolModel) => void
  onHome: () => void
  onSettings: () => void
  commands?: Command[]
  children: React.ReactNode
}

export function WorkspaceShell({ location, model, projectId, repoName, branch, sha, capabilities,
  canBack, canForward, onBack, onForward, onNavigate, onOpenFile, onOpenSymbol, onHome, onSettings,
  commands = [], children }: WorkspaceShellProps) {
  const [collapsed, setCollapsed] = useState(() => typeof localStorage !== "undefined" && localStorage.getItem("workspace-sidebar") === "collapsed")
  const [mobileOpen, setMobileOpen] = useState(false)
  const [palette, setPalette] = useState<PaletteMode>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [toast, setToast] = useState("")
  const showFileContext = ["explorer", "source", "flow", "impact", "humanize", "history", "refactor", "patch", "docs"].includes(location.view)
  const available = useMemo(() => availableViews(capabilities, !!projectId, !!model), [capabilities, projectId, model])
  const fileResults = useMemo(() => model ? fileMatches(model, query) : [], [model, query])
  const symbolResults = useMemo(() => model ? symbolMatches(model, query) : [], [model, query])
  const routeResults = useMemo(() => model && query.trim() ? model.api_routes.filter(route =>
    `${route.method} ${route.path}`.toLowerCase().includes(query.toLowerCase())).slice(0, 6) : [], [model, query])
  const allCommands = useMemo<Command[]>(() => [
    ...available.map(view => ({ id: `view-${view}`, label: `Open ${VIEW_LABELS[view]}`, run: () => onNavigate(view) })),
    ...commands.filter(command => command.enabled !== false),
    { id: "quick-open", label: "Quick Open File", description: "Ctrl/Cmd+P", run: () => openPalette("files") },
    { id: "settings", label: "Open Settings", run: onSettings },
    { id: "projects", label: "Switch Project", run: onHome },
    { id: "shortcuts", label: "Keyboard Shortcuts", run: () => setShortcutsOpen(true) },
  ], [available, commands, onNavigate, onSettings, onHome])
  const matchingCommands = query ? allCommands.filter(item => `${item.label} ${item.description || ""}`.toLowerCase().includes(query.toLowerCase())).slice(0, 20) : allCommands

  const openPalette = (mode: PaletteMode) => { setQuery(""); setPalette(mode); setMobileOpen(false); setShortcutsOpen(false) }
  const closePalette = () => { setPalette(null); setQuery("") }
  const announce = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2800) }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!palette && document.querySelector('[role="dialog"]')) return
      const target = event.target as HTMLElement | null
      const typing = !!target?.closest("input, textarea, select, [contenteditable='true']")
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault(); openPalette("commands")
      } else if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "p") {
        event.preventDefault(); openPalette("files")
      } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault(); openPalette("search")
      } else if (!typing && !palette && !shortcutsOpen && event.altKey && event.key === "ArrowLeft") {
        event.preventDefault(); onBack()
      } else if (!typing && !palette && !shortcutsOpen && event.altKey && event.key === "ArrowRight") {
        event.preventDefault(); onForward()
      } else if (!typing && !palette && !shortcutsOpen && !event.ctrlKey && !event.metaKey && event.key === "?") {
        event.preventDefault(); setShortcutsOpen(true)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onBack, onForward, palette, shortcutsOpen])

  const chooseFile = (path: string) => { onOpenFile(path, "source"); closePalette() }
  const chooseSymbol = (symbol: SymbolModel) => { onOpenSymbol(symbol); closePalette() }
  const nav = (compact: boolean) => <nav aria-label="Workspace navigation" className="space-y-4">
    {VIEW_GROUPS.map(group => {
      const views = group.views.filter(view => available.includes(view))
      if (!views.length) return null
      return <section key={group.label} aria-label={group.label}>
        {!compact && <h2 className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">{group.label}</h2>}
        <div className="space-y-0.5">{views.map(view => {
          const Icon = icons[view]
          return <button key={view} type="button" title={compact ? VIEW_LABELS[view] : undefined}
            aria-label={VIEW_LABELS[view]} aria-current={location.view === view ? "page" : undefined}
            onClick={() => { onNavigate(view); setMobileOpen(false) }}
            className={`flex w-full items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-brand ${compact ? "justify-center" : ""} ${location.view === view ? "border-brand bg-brand-soft font-semibold text-brand-text" : "border-transparent text-ink-secondary hover:bg-surface-inset hover:text-ink"}`}>
            <Icon className="h-4 w-4 shrink-0" />{!compact && <span className="truncate">{VIEW_LABELS[view]}</span>}
          </button>
        })}</div>
      </section>
    })}
  </nav>

  return <div className="workspace-shell mx-auto flex w-full max-w-[1800px] items-start">
    <aside className={`sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 overflow-y-auto border-r border-line bg-surface p-3 md:block ${collapsed ? "w-[72px]" : "w-56"}`}>
      <div className="mb-4 flex items-center justify-between gap-1">
        {!collapsed && <span className="px-2 text-xs font-semibold text-ink">Workspace</span>}
        <button onClick={() => { localStorage.setItem("workspace-sidebar", collapsed ? "expanded" : "collapsed"); setCollapsed(!collapsed) }}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="rounded-lg border border-line p-1.5 text-ink-secondary hover:text-ink"><MenuIcon className="h-4 w-4" /></button>
      </div>
      {nav(collapsed)}
      <div className="mt-5 border-t border-line pt-3 space-y-1">
        <button onClick={onSettings} aria-label="Settings" title="Settings" className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-secondary hover:bg-surface-inset">{collapsed ? "⚙" : "Settings"}</button>
        <button onClick={() => setShortcutsOpen(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts" className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-secondary hover:bg-surface-inset">{collapsed ? "?" : "Keyboard shortcuts"}</button>
      </div>
    </aside>
    <div className="min-w-0 flex-1">
      <div className="sticky top-16 z-30 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
          <button className="rounded-lg border border-line p-1.5 md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><MenuIcon className="h-4 w-4" /></button>
          <button onClick={onHome} className="font-semibold text-ink hover:text-brand" title="Switch project">{repoName}</button>
          <span className="rounded border border-line px-1.5 py-0.5"><GitBranchIcon className="mr-1 inline h-3 w-3" />{branch}</span>
          {sha && <span className="font-mono" title={sha}>{sha.slice(0, 8)}</span>}
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300">Server connected</span>
          <span className="rounded-full bg-brand-soft px-2 py-0.5 font-semibold text-brand-text">Analysis ready</span>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={onBack} disabled={!canBack} aria-label="Back" title="Back · Alt+Left" className="rounded border border-line px-2 py-1 disabled:opacity-40">←</button>
            <button onClick={onForward} disabled={!canForward} aria-label="Forward" title="Forward · Alt+Right" className="rounded border border-line px-2 py-1 disabled:opacity-40">→</button>
            <button onClick={() => void navigator.clipboard.writeText(window.location.href).then(() => announce("Link copied"), () => announce("Could not copy link"))}
              className="hidden rounded border border-line px-2 py-1 hover:border-brand sm:inline-flex" title="Copy link to this view">Copy link</button>
            <button onClick={() => openPalette("commands")} className="rounded border border-line px-2 py-1 hover:border-brand" title="Command palette · Ctrl/Cmd+K"><SearchIcon className="mr-1 inline h-3 w-3" />Commands <kbd className="hidden sm:inline">⌘K</kbd></button>
          </div>
        </div>
        <div aria-label="Breadcrumb" className="mt-2 flex min-w-0 flex-wrap items-center gap-1 text-xs text-ink-tertiary">
          <button onClick={onHome} className="hover:text-brand">Project</button><span>›</span>
          <button onClick={() => onNavigate(location.view)} className="font-medium text-ink hover:text-brand">{VIEW_LABELS[location.view]}</button>
          {showFileContext && location.file && <>{location.file.split("/").map((part, index, parts) => <React.Fragment key={`${index}-${part}`}><span>›</span><button onClick={() => index === parts.length - 1 ? chooseFile(location.file!) : onNavigate("explorer")} className="max-w-[220px] truncate hover:text-brand">{part}</button></React.Fragment>)}</>}
          {showFileContext && location.symbol && <><span>›</span><span className="font-mono text-ink">{location.symbol}</span></>}
          {showFileContext && location.line && <span className="font-mono">:{location.line}{location.endLine && location.endLine > location.line ? `-${location.endLine}` : ""}</span>}
        </div>
      </div>
      <div className="min-w-0 px-4 py-5 sm:px-6">{children}</div>
    </div>

    {mobileOpen && <AccessibleDialog title="Navigation" onClose={() => setMobileOpen(false)} className="max-w-sm">
      {nav(false)}<button onClick={() => { setMobileOpen(false); onSettings() }} className="mt-5 text-sm text-brand">Settings</button>
    </AccessibleDialog>}
    {palette && <AccessibleDialog title={palette === "commands" ? "Command palette" : palette === "files" ? "Quick Open File" : "Search repository"} onClose={closePalette} className="max-w-2xl">
      <input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "Enter") {
          const first = event.currentTarget.parentElement?.querySelector<HTMLElement>("[role='option']")
          if (first) { event.preventDefault(); event.key === "Enter" ? first.click() : first.focus() }
        }
      }} placeholder={palette === "commands" ? "Type a command…" : "Search files, symbols, or routes…"}
        aria-label="Search commands and repository" className="w-full rounded-xl border border-line bg-canvas px-4 py-3 text-sm outline-none focus:border-brand" />
      <div className="mt-3 max-h-[55vh] overflow-y-auto" role="listbox" aria-label="Results" onKeyDown={event => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
        const options = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[role='option']"))
        const index = options.indexOf(document.activeElement as HTMLElement)
        const next = event.key === "ArrowDown" ? options[index + 1] : options[index - 1]
        if (next) { event.preventDefault(); next.focus() }
      }}>
        {palette === "commands" && matchingCommands.map(command => <button key={command.id} role="option" aria-selected="false" onClick={() => { closePalette(); command.run() }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-brand-soft"><span className="font-medium">{command.label}</span>{command.description && <span className="ml-2 text-xs text-ink-tertiary">{command.description}</span>}</button>)}
        {palette !== "commands" && <>
          {fileResults.map(path => <button key={`file-${path}`} role="option" aria-selected="false" onClick={() => chooseFile(path)} className="block w-full rounded-lg px-3 py-2 text-left font-mono text-xs text-ink hover:bg-brand-soft">{path}</button>)}
          {symbolResults.map(symbol => <button key={`symbol-${symbol.file}-${symbol.name}-${symbol.line}`} role="option" aria-selected="false" onClick={() => chooseSymbol(symbol)} className="block w-full rounded-lg px-3 py-2 text-left text-xs text-ink hover:bg-brand-soft"><span className="font-semibold">{symbol.name}</span><span className="ml-2 font-mono text-ink-tertiary">{symbol.file}:{symbol.line || "?"}</span></button>)}
          {palette === "search" && routeResults.map(route => <button key={`route-${route.method}-${route.path}-${route.file}`} role="option" aria-selected="false" onClick={() => chooseFile(route.file)} className="block w-full rounded-lg px-3 py-2 text-left text-xs text-ink hover:bg-brand-soft">{route.method} {route.path}<span className="ml-2 font-mono text-ink-tertiary">{route.file}</span></button>)}
        </>}
        {query && (palette === "commands" ? !matchingCommands.length : !fileResults.length && !symbolResults.length && !routeResults.length) && <p className="p-4 text-sm text-ink-secondary">No matches in this repository snapshot.</p>}
        {!query && palette !== "commands" && <p className="p-4 text-sm text-ink-secondary">Type a filename, path, or symbol. Results use the current repository model without a new request.</p>}
      </div>
      <p className="mt-3 text-xs text-ink-tertiary">Escape closes · Results stay within the analyzed repository snapshot</p>
    </AccessibleDialog>}
    {shortcutsOpen && <AccessibleDialog title="Keyboard shortcuts" onClose={() => setShortcutsOpen(false)} className="max-w-md">
      <dl className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-3 text-sm text-ink">
        {[["Command palette", "Ctrl/Cmd+K"], ["Quick Open File", "Ctrl/Cmd+P"], ["Repository search", "Ctrl/Cmd+Shift+F"], ["Back", "Alt+Left"], ["Forward", "Alt+Right"], ["Shortcut help", "?"], ["Close dialog", "Esc"]].map(([label, key]) => <React.Fragment key={label}><dt>{label}</dt><dd><kbd className="rounded border border-line bg-surface-inset px-2 py-0.5 font-mono text-xs">{key}</kbd></dd></React.Fragment>)}
      </dl>
    </AccessibleDialog>}
    {toast && <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-[110] rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink shadow-float">{toast}<button onClick={() => setToast("")} aria-label="Dismiss notification" className="ml-3 text-ink-secondary"><XIcon className="h-3 w-3" /></button></div>}
  </div>
}
