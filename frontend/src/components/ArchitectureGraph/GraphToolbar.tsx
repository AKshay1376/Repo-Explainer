import React from "react"
import type { GraphMode, GraphDirection, GraphFilterState, GraphSummaryMetrics } from "../../types/graph"
import {
  LayersIcon,
  FolderTreeIcon,
  SearchIcon,
  FilterIcon,
  RotateCcwIcon,
  XIcon,
  ZapIcon,
} from "../ui/icons"

interface GraphToolbarProps {
  mode: GraphMode
  onModeChange: (mode: GraphMode) => void
  direction: GraphDirection
  onDirectionChange: (direction: GraphDirection) => void
  filters: GraphFilterState
  onFiltersChange: (filters: GraphFilterState) => void
  summary: GraphSummaryMetrics
  availableLayers: string[]
  availableCategories: string[]
  availableRelationships: string[]
  isTruncated: boolean
  totalMatching: number
  displayedCount: number
  selectedFile: string | null
  onFitView: () => void
  onZoomIn: () => void
  onZoomOut: () => void
}

export const GraphToolbar: React.FC<GraphToolbarProps> = ({
  mode,
  onModeChange,
  direction,
  onDirectionChange,
  filters,
  onFiltersChange,
  summary,
  availableLayers,
  availableCategories,
  availableRelationships,
  isTruncated,
  totalMatching,
  displayedCount,
  selectedFile,
  onFitView,
  onZoomIn,
  onZoomOut,
}) => {
  const [showFilters, setShowFilters] = React.useState(false)

  const handleSearchChange = (q: string) => {
    onFiltersChange({ ...filters, searchQuery: q })
  }

  const toggleNeighborhood = () => {
    onFiltersChange({
      ...filters,
      neighborhoodMode: !filters.neighborhoodMode,
    })
  }

  const toggleDepth = () => {
    onFiltersChange({
      ...filters,
      neighborhoodDepth: filters.neighborhoodDepth === 1 ? 2 : 1,
    })
  }

  const toggleShowAll = () => {
    onFiltersChange({
      ...filters,
      showAllFiles: !filters.showAllFiles,
    })
  }

  const activeFiltersCount =
    (filters.selectedLayer !== "all" ? 1 : 0) +
    (filters.selectedCategory !== "all" ? 1 : 0) +
    (filters.selectedRelationship !== "all" ? 1 : 0) +
    (filters.neighborhoodMode ? 1 : 0)

  return (
    <div className="space-y-3">
      {/* 1. Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-surface-subtle/70 border border-line-subtle rounded-2xl px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3 text-ink-secondary">
          <span className="font-semibold text-ink flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-brand" />
            <span>Architecture Metrics:</span>
          </span>
          <span>{summary.layersCount} layers</span>
          <span className="text-ink-tertiary">·</span>
          <span>{summary.filesCount} analyzed files</span>
          <span className="text-ink-tertiary">·</span>
          <span>{summary.dependenciesCount} internal dependencies</span>
          {summary.entryPointsCount > 0 && (
            <>
              <span className="text-ink-tertiary">·</span>
              <span className="text-brand font-medium">{summary.entryPointsCount} entry points</span>
            </>
          )}
          {summary.routesCount > 0 && (
            <>
              <span className="text-ink-tertiary">·</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                {summary.routesCount} API routes
              </span>
            </>
          )}
          {summary.modelsCount > 0 && (
            <>
              <span className="text-ink-tertiary">·</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                {summary.modelsCount} database models
              </span>
            </>
          )}
        </div>

        {/* Truncation warning banner if active */}
        {mode === "files" && isTruncated && (
          <div className="flex items-center gap-2 text-[11px] text-amber-600 dark:text-amber-400">
            <span>Showing top {displayedCount} of {totalMatching} files</span>
            <button
              onClick={toggleShowAll}
              className="font-bold underline hover:text-amber-700 dark:hover:text-amber-300 cursor-pointer"
            >
              Show all
            </button>
          </div>
        )}
      </div>

      {/* 2. Interactive Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface border border-line rounded-2xl p-2.5 shadow-sm">
        {/* Left: Mode & Layout Direction */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Mode Switcher */}
          <div className="flex items-center p-0.5 rounded-xl bg-surface-inset border border-line-subtle text-xs">
            <button
              onClick={() => onModeChange("architecture")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                mode === "architecture"
                  ? "bg-surface text-ink font-semibold shadow-xs border border-line"
                  : "text-ink-secondary hover:text-ink"
              }`}
            >
              <LayersIcon className="h-3.5 w-3.5 text-brand" />
              <span>Architecture (Layers)</span>
            </button>

            <button
              onClick={() => onModeChange("files")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                mode === "files"
                  ? "bg-surface text-ink font-semibold shadow-xs border border-line"
                  : "text-ink-secondary hover:text-ink"
              }`}
            >
              <FolderTreeIcon className="h-3.5 w-3.5 text-brand" />
              <span>Files (Dependencies)</span>
            </button>
          </div>

          {/* Direction Toggle */}
          <button
            onClick={() => onDirectionChange(direction === "TB" ? "LR" : "TB")}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-line bg-surface-inset text-xs font-mono text-ink-secondary hover:text-ink transition-colors cursor-pointer"
            title="Switch Layout Flow (Top-to-Bottom / Left-to-Right)"
          >
            <span className="text-[10px] text-ink-tertiary">Flow:</span>
            <span className="font-semibold text-brand">{direction}</span>
          </button>

          {/* Neighborhood Mode Toggle (Files mode) */}
          {mode === "files" && (
            <div className="flex items-center gap-1">
              <button
                onClick={toggleNeighborhood}
                disabled={!selectedFile}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                  filters.neighborhoodMode
                    ? "bg-brand text-white border-brand shadow-xs cursor-pointer"
                    : selectedFile
                    ? "bg-surface-inset border-line text-ink hover:border-brand-border cursor-pointer"
                    : "bg-surface-inset/50 border-line-subtle text-ink-tertiary/50 cursor-not-allowed"
                }`}
                title={
                  selectedFile
                    ? "Isolate selected file and its direct connections"
                    : "Select a file first to focus on its neighborhood"
                }
              >
                <ZapIcon className="h-3.5 w-3.5" />
                <span>Focus Neighborhood</span>
              </button>

              {filters.neighborhoodMode && (
                <button
                  onClick={toggleDepth}
                  className="px-2 py-1.5 rounded-xl border border-line bg-surface-inset text-xs font-mono text-ink cursor-pointer hover:border-brand-border"
                  title="Toggle 1-hop or 2-hop neighborhood depth"
                >
                  {filters.neighborhoodDepth} hop
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Search, Filters & View Zoom */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Graph Search */}
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-tertiary" />
            <input
              type="text"
              value={filters.searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search graph nodes..."
              className="w-40 sm:w-48 pl-8 pr-7 py-1 rounded-xl border border-line bg-surface-inset text-xs text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-brand"
            />
            {filters.searchQuery && (
              <button
                onClick={() => handleSearchChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-ink-tertiary hover:text-ink cursor-pointer"
              >
                <XIcon className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Filter Popover Toggle */}
          {mode === "files" && (
            <div className="relative">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  activeFiltersCount > 0
                    ? "bg-brand-surface border-brand-border text-brand-text font-semibold"
                    : "bg-surface-inset border-line text-ink hover:border-brand-border"
                }`}
              >
                <FilterIcon className="h-3.5 w-3.5 text-brand" />
                <span>Filter</span>
                {activeFiltersCount > 0 && (
                  <span className="h-4 w-4 rounded-full bg-brand text-white text-[10px] flex items-center justify-center font-bold">
                    {activeFiltersCount}
                  </span>
                )}
              </button>

              {/* Filters Dropdown Panel */}
              {showFilters && (
                <div className="absolute right-0 top-full mt-2 z-40 w-64 rounded-2xl border border-line bg-surface p-4 shadow-xl space-y-3 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between border-b border-line-subtle pb-2 text-xs font-semibold text-ink">
                    <span>Graph Filters</span>
                    <button
                      onClick={() => setShowFilters(false)}
                      className="text-ink-tertiary hover:text-ink cursor-pointer"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Architecture Layer filter */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                      Architecture Layer
                    </label>
                    <select
                      value={filters.selectedLayer}
                      onChange={(e) =>
                        onFiltersChange({ ...filters, selectedLayer: e.target.value })
                      }
                      className="w-full rounded-lg border border-line bg-surface-inset px-2 py-1 text-xs text-ink"
                    >
                      <option value="all">All Layers</option>
                      {availableLayers.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Category filter */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                      File Role
                    </label>
                    <select
                      value={filters.selectedCategory}
                      onChange={(e) =>
                        onFiltersChange({ ...filters, selectedCategory: e.target.value })
                      }
                      className="w-full rounded-lg border border-line bg-surface-inset px-2 py-1 text-xs text-ink capitalize"
                    >
                      <option value="all">All Roles</option>
                      {availableCategories.map((c) => (
                        <option key={c} value={c}>
                          {c.replace("-", " ")}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Relationship filter */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                      Relationship Type
                    </label>
                    <select
                      value={filters.selectedRelationship}
                      onChange={(e) =>
                        onFiltersChange({ ...filters, selectedRelationship: e.target.value })
                      }
                      className="w-full rounded-lg border border-line bg-surface-inset px-2 py-1 text-xs text-ink"
                    >
                      <option value="all">All Relationships</option>
                      {availableRelationships.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>

                  {activeFiltersCount > 0 && (
                    <button
                      onClick={() =>
                        onFiltersChange({
                          ...filters,
                          selectedLayer: "all",
                          selectedCategory: "all",
                          selectedRelationship: "all",
                        })
                      }
                      className="w-full py-1 text-center text-xs font-semibold text-brand hover:underline cursor-pointer pt-2 border-t border-line-subtle"
                    >
                      Reset Graph Filters
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Zoom & Fit View Controls */}
          <div className="flex items-center gap-1 border-l border-line pl-2">
            <button
              onClick={onZoomIn}
              className="p-1.5 rounded-lg border border-line-subtle bg-surface-inset text-ink-secondary hover:text-ink cursor-pointer"
              title="Zoom In"
              aria-label="Zoom In"
            >
              +
            </button>
            <button
              onClick={onZoomOut}
              className="p-1.5 rounded-lg border border-line-subtle bg-surface-inset text-ink-secondary hover:text-ink cursor-pointer"
              title="Zoom Out"
              aria-label="Zoom Out"
            >
              -
            </button>
            <button
              onClick={onFitView}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-line-subtle bg-surface-inset text-xs font-medium text-ink-secondary hover:text-ink cursor-pointer"
              title="Fit View"
              aria-label="Fit View"
            >
              <RotateCcwIcon className="h-3 w-3 text-brand" />
              <span>Fit</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
