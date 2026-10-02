import React, { memo } from "react"
import { Handle, Position } from "@xyflow/react"
import type { LayerNodeData } from "../../types/graph"
import { LayersIcon } from "../ui/icons"

interface LayerNodeProps {
  data: LayerNodeData
  targetPosition?: Position
  sourcePosition?: Position
}

export const LayerNode = memo(({ data, targetPosition = Position.Top, sourcePosition = Position.Bottom }: LayerNodeProps) => {
  const { layerName, fileCount, files } = data

  return (
    <div className="relative w-[260px] rounded-3xl p-4 bg-surface border border-line shadow-card hover:border-brand-border transition-all duration-200 cursor-pointer select-none">
      <Handle
        type="target"
        position={targetPosition}
        className="w-3 h-3 !bg-brand-border !border-2 !border-surface transition-transform"
      />

      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-brand-surface border border-brand-border/40 text-brand">
              <LayersIcon className="h-4 w-4" strokeWidth={1.75} />
            </div>
            <span className="font-bold text-sm text-ink">{layerName}</span>
          </div>

          <span className="inline-flex items-center rounded-full border border-line bg-surface-inset px-2.5 py-0.5 text-xs font-semibold text-ink-secondary">
            {fileCount} {fileCount === 1 ? "file" : "files"}
          </span>
        </div>

        {/* Top 3 file previews */}
        <div className="rounded-xl bg-surface-inset border border-line-subtle p-2 space-y-1">
          {files.slice(0, 3).map((f) => (
            <div
              key={f}
              className="font-mono text-[11px] text-ink-tertiary truncate flex items-center gap-1.5"
            >
              <span className="h-1 w-1 rounded-full bg-brand shrink-0" />
              <span className="truncate">{f.split("/").pop()}</span>
            </div>
          ))}
          {files.length > 3 && (
            <div className="text-[10px] text-ink-tertiary italic pl-2.5">
              + {files.length - 3} more files in layer
            </div>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={sourcePosition}
        className="w-3 h-3 !bg-brand !border-2 !border-surface transition-transform"
      />
    </div>
  )
})

LayerNode.displayName = "LayerNode"
