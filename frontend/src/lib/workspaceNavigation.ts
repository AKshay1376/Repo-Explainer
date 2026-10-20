import type { RepositoryModel } from "../types/repository"
import { tabAvailable } from "./deployment"
import { PLAN_TYPES } from "../types/refactor"

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
  story?: string | null
  step?: number | null
  presentation?: boolean
  graphMode?: "architecture" | "files" | null
  flow?: string | null
  trace?: string | null
  planType?: string | null
  planTarget?: string | null
  planDestination?: string | null
  lifecycle?: string | null
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
  const rawStory = candidate.story && /^[\w.:-]{1,100}$/.test(candidate.story) ? candidate.story : null
  const story = (view === "graph" && rawStory === "architecture") ||
    (view === "flow" && !!rawStory) ||
    (view === "impact" && /^impact-[a-z0-9]+$/.test(rawStory || "")) ||
    (view === "refactor" && /^refactor-[a-z0-9]+$/.test(rawStory || "")) ? rawStory : null
  const step = story && Number.isSafeInteger(candidate.step) && Number(candidate.step) > 0 && Number(candidate.step) <= 1000 ? Number(candidate.step) : null
  const graphMode = candidate.graphMode === "architecture" || candidate.graphMode === "files" ? candidate.graphMode : null
  const flow = candidate.flow && /^[\w.:-]{1,100}$/.test(candidate.flow) ? candidate.flow : null
  const trace = candidate.trace && /^[\w .:/{}-]{1,100}$/.test(candidate.trace) && !/^[a-z]:[\\/]/i.test(candidate.trace)
    && !/(?:\.env(?:\.|$)|credential|secret|token|private[_-]?key)/i.test(candidate.trace)
    ? candidate.trace : null
  const lifecycle = candidate.lifecycle && /^(patch|validator|job|refactor|documentation):[\w-]{1,40}$/.test(candidate.lifecycle) ? candidate.lifecycle : null
  const planType = view === "refactor" && candidate.planType && PLAN_TYPES.includes(candidate.planType as typeof PLAN_TYPES[number]) ? candidate.planType : null
  const safePlanValue = (value: string | null | undefined) => !!value && /^[\w./:@^-]{1,180}$/.test(value)
    && !/^(?:[a-z]:[\\/]|\/)|(?:^|\/)\.\.(?:\/|$)|(?:\.env|credential|secret|token|private[_-]?key)/i.test(value)
  const planTarget = planType && safePlanValue(candidate.planTarget) ? candidate.planTarget : null
  const planDestination = planTarget && safePlanValue(candidate.planDestination) ? candidate.planDestination : null
  return { view, file, symbol, line, endLine, commit, section, story, step, presentation: !!story && !!candidate.presentation, graphMode, flow, trace, lifecycle, planType, planTarget, planDestination }
}

export function readWorkspaceLink(search: string, model: RepositoryModel | undefined,
  allowed: WorkspaceView[], fallback: WorkspaceView): WorkspaceLocation {
  const query = new URLSearchParams(search)
  return sanitizeLocation({
    view: isWorkspaceView(query.get("view")) ? query.get("view") as WorkspaceView : fallback,
    file: query.get("file"), symbol: query.get("symbol"), line: Number(query.get("line")), endLine: Number(query.get("end")),
    commit: query.get("commit"), section: query.get("section"), story: query.get("story"), step: Number(query.get("step")),
    presentation: query.get("presentation") === "1", graphMode: query.get("graphMode") as WorkspaceLocation["graphMode"],
    flow: query.get("flow"), trace: query.get("trace"), lifecycle: query.get("lifecycle"),
    planType: query.get("planType"), planTarget: query.get("planTarget"), planDestination: query.get("planDestination"),
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
  if (location.story) query.set("story", location.story)
  if (location.step) query.set("step", String(location.step))
  if (location.presentation) query.set("presentation", "1")
  if (location.graphMode) query.set("graphMode", location.graphMode)
  if (location.flow) query.set("flow", location.flow)
  if (location.trace) query.set("trace", location.trace)
  if (location.lifecycle) query.set("lifecycle", location.lifecycle)
  if (location.planType) query.set("planType", location.planType)
  if (location.planTarget) query.set("planTarget", location.planTarget)
  if (location.planDestination) query.set("planDestination", location.planDestination)
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
