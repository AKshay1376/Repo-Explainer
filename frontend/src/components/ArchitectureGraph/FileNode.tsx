import React, { memo } from "react"
import { Handle, Position } from "@xyflow/react"
import type { FileNodeData } from "../../types/graph"
import {
  FileCodeIcon,
  ZapIcon,
  RouteIcon,
  DatabaseIcon,
  TagIcon,
} from "../ui/icons"

interface FileNodeProps {
  data: FileNodeData
  targetPosition?: Position
  sourcePosition?: Position
}

export const FileNode = memo(({ data, targetPosition = Position.Top, sourcePosition = Position.Bottom }: FileNodeProps) => {
  const {
    name,
    path,
    category,
    isEntryPoint,
    hasRoutes,
    hasDatabaseModels,
    isSelected,
    isDependency,
    isDependent,
    isDimmed,
    isSearchResult,
  } = data

  let borderStateClass = "border-line hover:border-brand-border bg-surface"
  if (isSelected) {
    borderStateClass = "border-brand ring-2 ring-brand/40 shadow-lg bg-brand-surface/70"
  } else if (isDependency) {
    borderStateClass = "border-sky-500 ring-1 ring-sky-500/30 bg-sky-500/5"
  } else if (isDependent) {
    borderStateClass = "border-emerald-500 ring-1 ring-emerald-500/30 bg-emerald-500/5"
  } else if (isSearchResult) {
    borderStateClass = "border-amber-500 ring-2 ring-amber-500/40 bg-amber-500/5"
  }

  return (
    <div
      className={`relative w-[240px] rounded-2xl p-3 text-left transition-all duration-150 border cursor-pointer select-none ${borderStateClass} ${
        isDimmed ? "opacity-30 hover:opacity-100" : "opacity-100"
      }`}
    >
      <Handle
        type="target"
        position={targetPosition}
        className="w-2.5 h-2.5 !bg-brand-border !border-2 !border-surface transition-transform"
      />

      <div className="space-y-1.5">
        {/* Top Badges */}
        <div className="flex items-center justify-between gap-1 text-[10px]">
          <div className="flex items-center gap-1 truncate">
            {category && category !== "unknown" && (
              <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 bg-surface-inset border border-line-subtle text-ink-tertiary capitalize truncate">
                <TagIcon className="h-2.5 w-2.5 text-brand" />
                <span className="truncate">{category.replace("-", " ")}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {isEntryPoint && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-bold bg-brand text-white text-[9px] shadow-xs">
                <ZapIcon className="h-2.5 w-2.5" />
                <span>ENTRY</span>
              </span>
            )}
            {hasRoutes && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-semibold text-[9px]">
                <RouteIcon className="h-2.5 w-2.5" />
                <span>ROUTE</span>
              </span>
            )}
            {hasDatabaseModels && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 font-semibold text-[9px]">
                <DatabaseIcon className="h-2.5 w-2.5" />
                <span>MODEL</span>
              </span>
            )}
          </div>
        </div>

        {/* Filename */}
        <div className="flex items-center gap-2">
          <FileCodeIcon
            className={`h-4 w-4 shrink-0 ${
              isSelected ? "text-brand" : "text-ink-tertiary"
            }`}
          />
          <div className="font-mono font-bold text-xs text-ink truncate" title={name}>
            {name}
          </div>
        </div>

        {/* Path or Neighborhood Context */}
        <div className="flex items-center justify-between text-[10px] text-ink-tertiary font-mono truncate">
          <span className="truncate">{path}</span>
          {isDependency && (
            <span className="text-sky-600 dark:text-sky-400 font-semibold shrink-0 ml-1">
              [depends on]
            </span>
          )}
          {isDependent && (
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold shrink-0 ml-1">
              [used by]
            </span>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={sourcePosition}
        className="w-2.5 h-2.5 !bg-brand !border-2 !border-surface transition-transform"
      />
    </div>
  )
})

FileNode.displayName = "FileNode"
