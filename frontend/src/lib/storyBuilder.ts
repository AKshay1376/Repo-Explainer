import type { Edge, Node } from "@xyflow/react"
import type { RepositoryModel } from "../types/repository"
import type { ExecutionFlow } from "../types/trace"
import type { ImpactAnalysis, ImpactType } from "../types/impact"
import type { RefactorPlan } from "../types/refactor"
import type { StorySequence, StorySourceLink, StoryStep } from "../types/story"
import { buildArchitectureLayersGraph } from "./graphData"

// Source links are metadata only. The source endpoint remains the authority for access checks.
export function safeStoryLink(file: string | null | undefined, line?: number | null, symbol?: string | null): StorySourceLink | null {
  if (!file || file.length > 300 || /[<>&\r\n\0]/.test(file) || file.startsWith("/") || /^[a-z]:[\\/]/i.test(file) || file.includes("\\") || file.split("/").some(part =>
    part === ".." || /^\.env(?:\.|$)/i.test(part) || /(?:credential|secret|token|api[_-]?key|private[_-]?key|id_rsa|\.pem$|\.key$)/i.test(part))) return null
  return { file, line: line && line > 0 ? line : null, symbol: symbol || null }
}

const links = (items: Array<StorySourceLink | null>) => items.filter((item): item is StorySourceLink => !!item)
const stableId = (value: string) => {
  let hash = 2166136261
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return (hash >>> 0).toString(36)
}
const sequence = (id: string, title: string, description: string, source_type: StorySequence["source_type"], steps: StoryStep[]): StorySequence =>
  ({ id, title, description, source_type, steps, current_step: 0 })

export function buildExecutionStory(flow: ExecutionFlow): StorySequence {
  const steps = flow.steps.map((step, index): StoryStep => {
    const incoming = flow.edges.filter(edge => edge.target_step === step.id && flow.steps.slice(0, index).some(previous => previous.id === edge.source_step))
    return {
      id: step.id, order: index + 1, node_ids: [step.id], edge_ids: incoming.map(edge => edge.id),
      title: step.label, description: index === 0 ? `${step.type.replace(/_/g, " ")} starts this path.` : `${step.type.replace(/_/g, " ")} follows ${incoming.map(edge => edge.relationship).join(", ") || "the previous step"}.`,
      evidence: [step.evidence, ...incoming.map(edge => edge.evidence)].filter(Boolean), source_links: links([safeStoryLink(step.file, step.line, step.symbol)]),
    }
  })
  return sequence(flow.is_primary ? "primary" : flow.id, flow.title, flow.description, "execution", steps)
}

const layerRank = (name: string) => {
  const value = name.toLowerCase()
  if (/entry|start|bootstrap/.test(value)) return 0
  if (/front|ui|view|presentation|component/.test(value)) return 1
  if (/api|route|controller|http/.test(value)) return 2
  if (/service|business|domain|logic/.test(value)) return 3
  if (/persist|model|database|data|storage/.test(value)) return 4
  if (/external|integrat|dependency|third/.test(value)) return 5
  return 6
}

export function buildArchitectureStory(model: RepositoryModel): StorySequence {
  const graph = buildArchitectureLayersGraph(model)
  const ordered = [...graph.nodes].sort((a, b) => layerRank(a.data.layerName) - layerRank(b.data.layerName) || a.data.layerName.localeCompare(b.data.layerName))
  const steps = ordered.map((node, index): StoryStep => ({
    id: node.id, order: index + 1, node_ids: [node.id],
    edge_ids: graph.edges.filter(edge => edge.source === node.id || edge.target === node.id).map(edge => edge.id),
    title: node.data.layerName, description: `${node.data.fileCount} file${node.data.fileCount === 1 ? "" : "s"} in this architecture layer.`,
    evidence: graph.edges.filter(edge => edge.source === node.id || edge.target === node.id).map(edge => edge.data.evidence),
    source_links: links(node.data.files.slice(0, 8).map(file => safeStoryLink(file))),
  }))
  return sequence("architecture", "Architecture path", "Detected layers and their cross-layer dependencies.", "architecture", steps)
}

const IMPACT_ORDER: ImpactType[] = ["TARGET", "DIRECT", "TRANSITIVE", "ROUTE", "MODEL", "TEST"]
export function buildImpactStory(analysis: ImpactAnalysis): StorySequence {
  const steps = IMPACT_ORDER.flatMap((kind): StoryStep[] => {
    const group = analysis.nodes.filter(node => node.impact_type === kind)
    if (!group.length) return []
    const ids = new Set(group.map(node => node.id))
    const relevantEdges = analysis.edges.filter(edge => ids.has(edge.source) || ids.has(edge.target))
    return [{
      id: kind.toLowerCase(), order: 0, node_ids: group.map(node => node.id), edge_ids: relevantEdges.map(edge => edge.id),
      title: kind === "TARGET" ? "Change target" : `${kind[0]}${kind.slice(1).toLowerCase()} ${kind === "DIRECT" || kind === "TRANSITIVE" ? "dependents" : "connections"}`,
      description: `${group.length} ${kind.toLowerCase()} node${group.length === 1 ? "" : "s"} supported by the impact graph.`,
      evidence: group.slice(0, 8).map(node => node.evidence).filter(Boolean),
      source_links: links(group.slice(0, 8).map(node => safeStoryLink(node.file, node.line, node.symbol))),
    }]
  }).map((step, index) => ({ ...step, order: index + 1 }))
  return sequence(`impact-${stableId(analysis.id)}`, "Blast radius", analysis.summary, "impact", steps)
}

export function buildRefactorStory(plan: RefactorPlan): StorySequence {
  const steps = [...plan.steps].sort((a, b) => a.order - b.order).map((step, index): StoryStep => ({
    id: step.id, order: index + 1, node_ids: [step.id], edge_ids: step.prerequisites.map(parent => `${parent}-${step.id}`),
    title: step.title,
    description: `${step.description} Prerequisites: ${step.prerequisites.join(", ") || "none"}. Risk: ${step.risk_level}. Validation: ${step.validation.join(", ") || "manual review"}.`,
    evidence: [step.change_type, ...step.validation],
    source_links: links(step.source_locations.map(item => safeStoryLink(item.path, item.line))),
  }))
  return sequence(`refactor-${stableId(plan.id)}`, "Refactor plan", plan.summary, "refactor", steps)
}

export type StoryRole = "current" | "previous" | "future" | "unrelated"
export function storyRoles(story: StorySequence | null, index: number): { nodes: Map<string, StoryRole>; edges: Map<string, StoryRole> } {
  const nodes = new Map<string, StoryRole>(), edges = new Map<string, StoryRole>()
  story?.steps.forEach((step, position) => {
    const role: StoryRole = position === index ? "current" : position < index ? "previous" : "future"
    step.node_ids.forEach(id => { if (!nodes.has(id) || role === "current") nodes.set(id, role) })
    step.edge_ids.forEach(id => { if (!edges.has(id) || role === "current") edges.set(id, role) })
  })
  return { nodes, edges }
}

export function decorateStoryGraph(nodes: Node[], edges: Edge[], story: StorySequence | null, index: number, focused?: Set<string> | null) {
  if (!story && !focused) return { nodes, edges }
  const roles = storyRoles(story, index)
  const opacity = (role: StoryRole) => role === "current" ? 1 : role === "previous" ? 0.58 : role === "future" ? 0.28 : 0.14
  return {
    nodes: nodes.map(node => {
      const role = roles.nodes.get(node.id) || "unrelated"
      return { ...node, style: { ...node.style, opacity: focused && !focused.has(node.id) ? 0.1 : story ? opacity(role) : 1,
        outline: story && role === "current" ? "3px solid #f97316" : undefined, outlineOffset: 3 } }
    }),
    edges: edges.map(edge => {
      const role = roles.edges.get(edge.id) || "unrelated"
      return { ...edge, animated: false, style: { ...edge.style, opacity: focused && (!focused.has(edge.source) || !focused.has(edge.target)) ? 0.08 : story ? opacity(role) : 1,
        stroke: story && role === "current" ? "#f97316" : edge.style?.stroke, strokeWidth: story && role === "current" ? 3 : edge.style?.strokeWidth } }
    }),
  }
}

export function focusedRoute(nodes: Node[], edges: Edge[], selected: string | null, direction: "upstream" | "downstream" | "both", hops: 1 | 2 | "full"): Set<string> | null {
  if (!selected || !nodes.some(node => node.id === selected)) return null
  const visible = new Set([selected]), frontier = [selected]
  const limit = hops === "full" ? nodes.length : hops
  for (let depth = 0; depth < limit && frontier.length; depth++) {
    const next: string[] = []
    edges.forEach(edge => {
      const candidate = (direction === "downstream" || direction === "both") && frontier.includes(edge.source) ? edge.target
        : (direction === "upstream" || direction === "both") && frontier.includes(edge.target) ? edge.source : null
      if (candidate && !visible.has(candidate)) { visible.add(candidate); next.push(candidate) }
    })
    frontier.splice(0, frontier.length, ...next)
  }
  return visible
}
