/**
 * frontend/src/components/ChangeImpact/ImpactToolbar.tsx
 * Target selection controls, change type dropdown, depth setting,
 * and filter/sorting toolbar for Change Impact Analysis.
 */

import React, { useMemo } from "react"
import type { ChangeType } from "../../types/impact"
import type { RepositoryModel } from "../../types/repository"
import { SearchIcon, ZapIcon, FilterIcon } from "../ui/icons"

interface ImpactToolbarProps {
  repositoryModel?: RepositoryModel
  targetFile: string
  targetSymbol: string
  changeType: ChangeType
  depth: number
  isLoading: boolean
  impactFilter: string
  confidenceFilter: string
  layerFilter: string
  searchFilter: string
  sortBy: "depth" | "confidence" | "name"
  layoutDirection: "LR" | "TB"
  onTargetFileChange: (val: string) => void
  onTargetSymbolChange: (val: string) => void
  onChangeTypeChange: (val: ChangeType) => void
  onDepthChange: (val: number) => void
  onImpactFilterChange: (val: string) => void
  onConfidenceFilterChange: (val: string) => void
  onLayerFilterChange: (val: string) => void
  onSearchFilterChange: (val: string) => void
  onSortByChange: (val: "depth" | "confidence" | "name") => void
  onToggleLayout: () => void
  onAnalyze: () => void
}

const CHANGE_TYPES: { value: ChangeType; label: string }[] = [
  { value: "GENERAL", label: "General Code Change" },
  { value: "FUNCTION_SIGNATURE", label: "Function Signature Change" },
  { value: "ROUTE_PATH", label: "API Route Path Change" },
  { value: "DATABASE_SCHEMA", label: "Database Schema Change" },
  { value: "RETURN_TYPE", label: "Return Type Change" },
  { value: "ENVIRONMENT_VARIABLE", label: "Environment Variable Change" },
  { value: "PUBLIC_API", label: "Public API / Export Change" },
]

export const ImpactToolbar: React.FC<ImpactToolbarProps> = ({
  repositoryModel,
  targetFile,
  targetSymbol,
  changeType,
  depth,
  isLoading,
  impactFilter,
  confidenceFilter,
  layerFilter,
  searchFilter,
  sortBy,
  layoutDirection,
  onTargetFileChange,
  onTargetSymbolChange,
  onChangeTypeChange,
  onDepthChange,
  onImpactFilterChange,
  onConfidenceFilterChange,
  onLayerFilterChange,
  onSearchFilterChange,
  onSortByChange,
  onToggleLayout,
  onAnalyze,
}) => {
  // Available files in repo for datalist suggestions
  const availableFiles = useMemo(() => {
    if (!repositoryModel?.files) return []
    return Object.keys(repositoryModel.files).sort()
  }, [repositoryModel])

  // Distinct architecture layers
  const availableLayers = useMemo(() => {
    if (!repositoryModel?.architecture_layers) return []
    return Object.keys(repositoryModel.architecture_layers).sort()
  }, [repositoryModel])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetFile.trim()) return
    onAnalyze()
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-3">
      {/* Primary Target Formulation Form */}
      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3">
        {/* Target File Input with Datalist */}
        <div className="flex-1 min-w-[240px]">
          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Target File <span className="text-primary">*</span>
          </label>
          <input
            type="text"
            list="repo-files-list"
            value={targetFile}
            onChange={(e) => onTargetFileChange(e.target.value)}
            placeholder="e.g. src/services/authService.ts"
            className="w-full h-9 px-3 text-xs font-mono rounded-lg bg-background border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            required
          />
          <datalist id="repo-files-list">
            {availableFiles.slice(0, 150).map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </div>

        {/* Target Symbol Input (Optional) */}
        <div className="w-full sm:w-44">
          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Symbol (Optional)
          </label>
          <input
            type="text"
            value={targetSymbol}
            onChange={(e) => onTargetSymbolChange(e.target.value)}
            placeholder="e.g. login, User"
            className="w-full h-9 px-3 text-xs font-mono rounded-lg bg-background border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Change Type Dropdown */}
        <div className="w-full sm:w-56">
          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Change Type
          </label>
          <select
            value={changeType}
            onChange={(e) => onChangeTypeChange(e.target.value as ChangeType)}
            className="w-full h-9 px-2.5 text-xs rounded-lg bg-background border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {CHANGE_TYPES.map((ct) => (
              <option key={ct.value} value={ct.value}>
                {ct.label}
              </option>
            ))}
          </select>
        </div>

        {/* Depth Setting: 1..4 */}
        <div className="w-auto">
          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Max Depth
          </label>
          <div className="flex items-center h-9 bg-background border border-border rounded-lg p-0.5">
            {[1, 2, 3, 4].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onDepthChange(d)}
                className={`px-2.5 h-full text-xs font-semibold rounded ${
                  depth === d
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Analyze Button */}
        <div className="w-full sm:w-auto pt-4 sm:pt-0 self-end">
          <button
            type="submit"
            disabled={isLoading || !targetFile.trim()}
            className="w-full sm:w-auto h-9 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <ZapIcon className="w-4 h-4" />
            )}
            Analyze Impact
          </button>
        </div>
      </form>

      {/* Secondary Row: Filters, Search, Sorting, and Orientation */}
      <div className="pt-2 border-t border-border/60 flex flex-wrap items-center justify-between gap-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Filter */}
          <div className="relative w-40 sm:w-48">
            <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => onSearchFilterChange(e.target.value)}
              placeholder="Filter nodes..."
              className="w-full h-8 pl-8 pr-2 text-xs rounded-md bg-background border border-border focus:outline-none focus:border-primary"
            />
          </div>

          {/* Impact Level Filter */}
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground text-[11px] font-medium hidden sm:inline">Level:</span>
            <select
              value={impactFilter}
              onChange={(e) => onImpactFilterChange(e.target.value)}
              className="h-8 px-2 text-xs rounded-md bg-background border border-border focus:outline-none focus:border-primary"
            >
              <option value="ALL">All Levels</option>
              <option value="DIRECT">Direct Only</option>
              <option value="TRANSITIVE">Transitive Only</option>
              <option value="TEST">Tests Only</option>
            </select>
          </div>

          {/* Confidence Filter */}
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground text-[11px] font-medium hidden sm:inline">Conf:</span>
            <select
              value={confidenceFilter}
              onChange={(e) => onConfidenceFilterChange(e.target.value)}
              className="h-8 px-2 text-xs rounded-md bg-background border border-border focus:outline-none focus:border-primary"
            >
              <option value="ALL">All Confidences</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="LIKELY">Likely</option>
              <option value="INFERRED">Inferred</option>
            </select>
          </div>

          {/* Layer Filter */}
          {availableLayers.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground text-[11px] font-medium hidden sm:inline">Layer:</span>
              <select
                value={layerFilter}
                onChange={(e) => onLayerFilterChange(e.target.value)}
                className="h-8 px-2 text-xs rounded-md bg-background border border-border focus:outline-none focus:border-primary"
              >
                <option value="ALL">All Layers</option>
                {availableLayers.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Right side: Sorting & Layout Orientation */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground text-[11px] font-medium hidden sm:inline">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => onSortByChange(e.target.value as "depth" | "confidence" | "name")}
              className="h-8 px-2 text-xs rounded-md bg-background border border-border focus:outline-none focus:border-primary"
            >
              <option value="depth">By Depth</option>
              <option value="confidence">By Confidence</option>
              <option value="name">Alphabetical</option>
            </select>
          </div>

          <button
            type="button"
            onClick={onToggleLayout}
            className="h-8 px-2.5 rounded-md border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground text-[11px] font-mono transition-colors"
            title="Toggle between Left-to-Right and Top-to-Bottom graph layout"
          >
            {layoutDirection === "LR" ? "Flow: → LR" : "Flow: ↓ TB"}
          </button>
        </div>
      </div>
    </div>
  )
}
