import React, { useMemo } from "react"
import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react"
import type { LifecycleType } from "../../types/story"
import { buildLifecycle } from "../../lib/lifecycle"
import { applyImpactGraphLayout } from "../../lib/graphLayout"

interface Props { type: LifecycleType; status?: string | null; detail?: string; compact?: boolean }

export const LifecycleGraph: React.FC<Props> = ({ type, status, detail, compact = false }) => {
  const lifecycle = useMemo(() => buildLifecycle(type, status, detail), [type, status, detail])
  const linked = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("lifecycle")
  const stateLink = typeof window === "undefined" || !lifecycle.current ? null : (() => {
    const url = new URL(window.location.href)
    url.searchParams.set("lifecycle", `${type}:${lifecycle.current}`)
    return url.toString()
  })()
  const graph = useMemo(() => {
    const nodes: Node[] = lifecycle.states.map(state => ({
      id: state.id, data: { label: state.label }, position: { x: 0, y: 0 },
      style: { width: 150, borderRadius: 10, padding: 8, border: state.current ? "3px solid #f97316" : "1px solid #94a3b8",
        background: state.current ? "#ffedd5" : state.reached ? "#ecfdf5" : "#f8fafc", color: "#172033", opacity: state.possible ? .6 : 1 },
    }))
    const edges: Edge[] = lifecycle.edges.map(edge => ({ id: `${edge.source}-${edge.target}`, source: edge.source, target: edge.target,
      style: { stroke: lifecycle.current === edge.target ? "#f97316" : "#94a3b8", strokeWidth: lifecycle.current === edge.target ? 2.5 : 1.5 } }))
    return applyImpactGraphLayout(nodes, edges, "LR")
  }, [lifecycle])
  return <section aria-label={`${type} lifecycle`} className="rounded-xl border border-line bg-surface p-3">
    <div className="flex flex-wrap justify-between gap-2 text-xs text-ink-secondary"><strong className="text-ink">{type.replace(/\b\w/g, letter => letter.toUpperCase())} lifecycle</strong><span>Current: {lifecycle.states.find(state => state.current)?.label || status || "Unknown"}</span>{stateLink && <a href={stateLink} className="text-brand underline">Link to state</a>}</div>
    {linked?.startsWith(`${type}:`) && linked !== `${type}:${lifecycle.current}` && <p className="text-[11px] text-amber-700">The linked state differs from the current observed state.</p>}
    {detail && <p className="mt-1 text-xs text-ink-secondary">{detail}</p>}
    <div className={compact ? "h-40" : "h-52"}>
      <ReactFlow nodes={graph.nodes} edges={graph.edges} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} minZoom={0.2} proOptions={{ hideAttribution: true }}>
        <Background gap={20} size={1} /><Controls showInteractive={false} />
      </ReactFlow>
    </div>
    <p className="text-[11px] text-ink-tertiary">Outlined state is observed; pale states are possible transitions.</p>
  </section>
}
