import type { RepositoryModel } from "../types/repository"
import { tabAvailable } from "./deployment"

export const VIEW_GROUPS = [
  { label: "Understand", views: ["explorer", "graph", "source", "flow", "ask"] },
  { label: "Analyze", views: ["impact", "humanize", "health", "history"] },
  { label: "Change", views: ["refactor", "patch", "validation"] },
  { label: "Document", views: ["docs", "report"] },
  { label: "Project", views: ["project"] },
] as const

export type WorkspaceView = typeof VIEW_GROUPS[number]["views"][number]
export type WorkspaceLocation = {
  view: WorkspaceView
  file: string | null
  symbol?: string | null
  line?: number | null
  endLine?: number | null
  commit?: string | null
  section?: string | null
}

export const VIEW_LABELS: Record<WorkspaceView, string> = {
  explorer: "Explorer", graph: "Architecture", source: "Source", flow: "Execution",
  ask: "Ask Repo", impact: "Impact", humanize: "Humanize", health: "Project Health",
  history: "History", refactor: "Refactor", patch: "Patch Review", validation: "Validation",
  docs: "Documentation", report: "Report", project: "Saved Project",
}

export function isWorkspaceView(value: string | null): value is WorkspaceView {
  return !!value && Object.prototype.hasOwnProperty.call(VIEW_LABELS, value)
}

export function availableViews(capabilities: Record<string, boolean>, hasProject: boolean, hasModel: boolean): WorkspaceView[] {
  return VIEW_GROUPS.flatMap(group => group.views).filter(view =>
    (view !== "project" || hasProject) &&
    (hasModel || ["report", "ask", "project"].includes(view)) &&
    tabAvailable(view, capabilities)
  )
}

export function sanitizeLocation(candidate: Partial<WorkspaceLocation>, model: RepositoryModel | undefined,
  allowed: WorkspaceView[], fallback: WorkspaceView): WorkspaceLocation {
  const view = candidate.view && allowed.includes(candidate.view) ? candidate.view : fallback
  const file = candidate.file && model?.files?.[candidate.file] ? candidate.file : null
  const symbol = file && candidate.symbol && model?.symbols?.some(item => item.file === file && item.name === candidate.symbol)
    ? candidate.symbol : null
  const line = file && Number.isSafeInteger(candidate.line) && Number(candidate.line) > 0 && Number(candidate.line) < 1000000
    ? Number(candidate.line) : null
  const endLine = line && Number.isSafeInteger(candidate.endLine) && Number(candidate.endLine) >= line && Number(candidate.endLine) < 1000000
    ? Number(candidate.endLine) : null
  const commit = candidate.commit && /^[0-9a-f]{7,64}$/i.test(candidate.commit) ? candidate.commit : null
  const section = candidate.section && /^[\w-]{1,80}$/.test(candidate.section) ? candidate.section : null
  return { view, file, symbol, line, endLine, commit, section }
}

export function readWorkspaceLink(search: string, model: RepositoryModel | undefined,
  allowed: WorkspaceView[], fallback: WorkspaceView): WorkspaceLocation {
  const query = new URLSearchParams(search)
  return sanitizeLocation({
    view: isWorkspaceView(query.get("view")) ? query.get("view") as WorkspaceView : fallback,
    file: query.get("file"), symbol: query.get("symbol"), line: Number(query.get("line")), endLine: Number(query.get("end")),
    commit: query.get("commit"), section: query.get("section"),
  }, model, allowed, fallback)
}

export function workspaceLink(location: WorkspaceLocation, model: RepositoryModel | undefined,
  projectId?: string | null): string {
  const query = new URLSearchParams()
  if (model?.metadata?.owner && model.metadata.repo) query.set("repo", `${model.metadata.owner}/${model.metadata.repo}`)
  if (projectId) query.set("project", projectId)
  query.set("view", location.view)
  if (location.file) query.set("file", location.file)
  if (location.symbol) query.set("symbol", location.symbol)
  if (location.line) query.set("line", String(location.line))
  if (location.endLine) query.set("end", String(location.endLine))
  if (location.commit) query.set("commit", location.commit)
  if (location.section) query.set("section", location.section)
  return `/?${query}`
}

export function fileMatches(model: RepositoryModel, query: string, limit = 30) {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const results = Object.keys(model.files || {}).filter(path => path.toLowerCase().includes(needle))
  results.sort((a, b) => {
    const aName = a.split("/").pop()?.toLowerCase() || a
    const bName = b.split("/").pop()?.toLowerCase() || b
    return Number(bName.startsWith(needle)) - Number(aName.startsWith(needle)) || a.length - b.length || a.localeCompare(b)
  })
  return results.slice(0, limit)
}

export function symbolMatches(model: RepositoryModel, query: string, limit = 15) {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  return (model.symbols || []).filter(symbol => symbol.name.toLowerCase().includes(needle) && !!model.files?.[symbol.file]).slice(0, limit)
}
