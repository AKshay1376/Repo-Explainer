/**
 * frontend/src/components/ChangeImpact/ImpactNodeView.tsx
 * Custom React Flow node rendering an ImpactNode with type badges,
 * confidence indicators, layer tagging, and selection highlights.
 */

import React from "react"
import { Handle, Position } from "@xyflow/react"
import type { ImpactNode, ImpactType, ImpactConfidence } from "../../types/impact"
import { FileCodeIcon, ZapIcon, RouteIcon, DatabaseIcon, CheckCircleIcon } from "../ui/icons"

interface ImpactNodeViewProps {
  data: ImpactNode & {
    isSelected?: boolean
  }
}

const TYPE_STYLES: Record<
  ImpactType,
  { bg: string; border: string; text: string; label: string; badgeBg: string }
> = {
  TARGET: {
    bg: "bg-purple-950/40 dark:bg-purple-950/60",
    border: "border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]",
    text: "text-purple-300",
    label: "TARGET",
    badgeBg: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  },
  DIRECT: {
    bg: "bg-sky-950/40 dark:bg-sky-950/60",
    border: "border-sky-500/80 shadow-[0_0_12px_rgba(14,165,233,0.2)]",
    text: "text-sky-300",
    label: "DIRECT",
    badgeBg: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  },
  TRANSITIVE: {
    bg: "bg-indigo-950/30 dark:bg-indigo-950/50",
    border: "border-indigo-500/60",
    text: "text-indigo-300",
    label: "TRANSITIVE",
    badgeBg: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  },
  TEST: {
    bg: "bg-amber-950/30 dark:bg-amber-950/50",
    border: "border-amber-500/70",
    text: "text-amber-300",
    label: "TEST",
    badgeBg: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  },
  ROUTE: {
    bg: "bg-emerald-950/30 dark:bg-emerald-950/50",
    border: "border-emerald-500/70",
    text: "text-emerald-300",
    label: "ROUTE",
    badgeBg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  },
  MODEL: {
    bg: "bg-rose-950/30 dark:bg-rose-950/50",
    border: "border-rose-500/70",
    text: "text-rose-300",
    label: "MODEL",
    badgeBg: "bg-rose-500/20 text-rose-300 border-rose-500/30",
  },
}

const CONFIDENCE_BADGES: Record<ImpactConfidence, { color: string; label: string }> = {
  CONFIRMED: { color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", label: "Confirmed" },
  LIKELY: { color: "text-amber-400 bg-amber-500/10 border-amber-500/30", label: "Likely" },
  INFERRED: { color: "text-slate-400 bg-slate-500/10 border-slate-500/30", label: "Inferred" },
}

export const ImpactNodeView: React.FC<ImpactNodeViewProps> = ({ data }) => {
  const nodeType = (data.impact_type || "DIRECT") as ImpactType
  const style = TYPE_STYLES[nodeType] || TYPE_STYLES.DIRECT
  const confStyle = CONFIDENCE_BADGES[data.confidence] || CONFIDENCE_BADGES.CONFIRMED

  const fileName = data.file ? data.file.split("/").pop() || data.file : "unknown"
  const dirPath = data.file && data.file.includes("/") ? data.file.substring(0, data.file.lastIndexOf("/")) : ""

  const isSelected = data.isSelected

  return (
    <div
      className={`relative w-[260px] rounded-lg border p-3 backdrop-blur-md transition-all cursor-pointer select-none ${
        style.bg
      } ${style.border} ${
        isSelected ? "ring-2 ring-primary shadow-lg scale-[1.02]" : "hover:border-primary/60 hover:shadow-md"
      }`}
    >
      {/* React Flow Handles */}
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-primary border-none" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-primary border-none" />

      {/* Top row: Impact badge & Confidence */}
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${style.badgeBg}`}>
          {style.label} {data.depth > 0 && `(D${data.depth})`}
        </span>
        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded border flex items-center gap-1 ${confStyle.color}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {confStyle.label}
        </span>
      </div>

      {/* Center: File and Symbol Name */}
      <div className="flex items-start gap-2">
        <div className="mt-0.5 text-muted-foreground shrink-0">
          {nodeType === "ROUTE" ? (
            <RouteIcon className="w-3.5 h-3.5 text-emerald-400" />
          ) : nodeType === "MODEL" ? (
            <DatabaseIcon className="w-3.5 h-3.5 text-rose-400" />
          ) : (
            <FileCodeIcon className="w-3.5 h-3.5 text-sky-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs font-semibold text-foreground truncate" title={data.file}>
            {fileName}
          </div>
          {data.symbol && (
            <div className="text-[11px] font-mono text-primary truncate" title={`Symbol: ${data.symbol}`}>
              {data.symbol}()
            </div>
          )}
          {dirPath && (
            <div className="text-[10px] text-muted-foreground truncate" title={dirPath}>
              {dirPath}
            </div>
          )}
        </div>
      </div>

      {/* Bottom row: Architecture layer badge */}
      {data.architecture_layer && data.architecture_layer !== "Unassigned" && (
        <div className="mt-2 pt-1.5 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="truncate">{data.architecture_layer}</span>
          <span className="text-[9px] uppercase tracking-wider opacity-70">{data.category}</span>
        </div>
      )}
    </div>
  )
}
