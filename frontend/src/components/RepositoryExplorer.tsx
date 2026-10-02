import React, { useState, useMemo } from "react"
import type { RepositoryModel, FileModel } from "../types/repository"
import {
  SearchIcon,
  FilterIcon,
  FolderTreeIcon,
  FileCodeIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  TagIcon,
  CodeIcon,
  LayersIcon,
  ZapIcon,
  XIcon,
} from "./ui/icons"

interface RepositoryExplorerProps {
  model: RepositoryModel
  selectedFile: string | null
  onSelectFile: (path: string) => void
}

export const RepositoryExplorer: React.FC<RepositoryExplorerProps> = ({
  model,
  selectedFile,
  onSelectFile,
}) => {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedLanguage, setSelectedLanguage] = useState<string>("all")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [selectedLayer, setSelectedLayer] = useState<string>("all")
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    ".": true,
    src: true,
  })

  const allFilesList = useMemo(() => {
    return Object.values(model.files || {})
  }, [model.files])

  // Extract unique languages, categories, and layers for filter options
  const filterOptions = useMemo(() => {
    const languages = new Set<string>()
    const categories = new Set<string>()

    allFilesList.forEach((f) => {
      if (f.language && f.language !== "Unknown") languages.add(f.language)
      if (f.category && f.category !== "unknown") categories.add(f.category)
    })

    const layers = Object.keys(model.architecture_layers || {})

    return {
      languages: Array.from(languages).sort(),
      categories: Array.from(categories).sort(),
      layers: layers.sort(),
    }
  }, [allFilesList, model.architecture_layers])

  // Precomputed symbol map by file for fast search
  const symbolsByFile = useMemo(() => {
    const map: Record<string, string[]> = {}
    ;(model.symbols || []).forEach((s) => {
      const p = s.file.replace(/\\/g, "/")
      if (!map[p]) map[p] = []
      map[p].push(s.name.toLowerCase())
    })
    return map
  }, [model.symbols])

  // Client-side search and filtering
  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const hasFilter =
      q !== "" ||
      selectedLanguage !== "all" ||
      selectedCategory !== "all" ||
      selectedLayer !== "all"

    if (!hasFilter) {
      return null // Indicate tree view should be displayed
    }

    const layerFilesSet =
      selectedLayer !== "all"
        ? new Set(model.architecture_layers?.[selectedLayer] || [])
        : null

    return allFilesList.filter((f) => {
      // Language filter
      if (selectedLanguage !== "all" && f.language !== selectedLanguage) {
        return false
      }
      // Category filter
      if (selectedCategory !== "all" && f.category !== selectedCategory) {
        return false
      }
      // Architecture layer filter
      if (layerFilesSet && !layerFilesSet.has(f.path)) {
        return false
      }
      // Search query
      if (q !== "") {
        const pathMatch = f.path.toLowerCase().includes(q)
        const nameMatch = f.name.toLowerCase().includes(q)
        const catMatch = (f.category || "").toLowerCase().includes(q)
        const syms = symbolsByFile[f.path] || []
        const symMatch = syms.some((s) => s.includes(q))
        return pathMatch || nameMatch || catMatch || symMatch
      }

      return true
    })
  }, [
    searchQuery,
    selectedLanguage,
    selectedCategory,
    selectedLayer,
    allFilesList,
    model.architecture_layers,
    symbolsByFile,
  ])

  const toggleFolder = (folder: string) => {
    setOpenFolders((prev) => ({
      ...prev,
      [folder]: !prev[folder],
    }))
  }

  const resetFilters = () => {
    setSearchQuery("")
    setSelectedLanguage("all")
    setSelectedCategory("all")
    setSelectedLayer("all")
  }

  const isFilteringActive =
    searchQuery !== "" ||
    selectedLanguage !== "all" ||
    selectedCategory !== "all" ||
    selectedLayer !== "all"

  return (
    <div className="flex flex-col h-full bg-surface text-ink">
      {/* Search Header */}
      <div className="p-4 sm:p-5 border-b border-line space-y-3">
        <div className="relative">
          <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-tertiary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files, symbols, routes, or categories..."
            className="w-full rounded-xl border border-line bg-surface-inset pl-9 pr-9 py-2 text-xs text-ink placeholder:text-ink-tertiary focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-ink-tertiary hover:text-ink cursor-pointer"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Compact Filters Row */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {/* Language dropdown */}
          <div className="relative">
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="rounded-lg border border-line bg-surface-inset px-2 py-1 text-ink focus:outline-none focus:border-brand cursor-pointer text-[11px]"
            >
              <option value="all">Language: All</option>
              {filterOptions.languages.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          {/* Category dropdown */}
          <div className="relative">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-lg border border-line bg-surface-inset px-2 py-1 text-ink focus:outline-none focus:border-brand cursor-pointer text-[11px]"
            >
              <option value="all">Role: All</option>
              {filterOptions.categories.map((c) => (
                <option key={c} value={c}>
                  {c.replace("-", " ")}
                </option>
              ))}
            </select>
          </div>

          {/* Layer dropdown */}
          {filterOptions.layers.length > 0 && (
            <div className="relative">
              <select
                value={selectedLayer}
                onChange={(e) => setSelectedLayer(e.target.value)}
                className="rounded-lg border border-line bg-surface-inset px-2 py-1 text-ink focus:outline-none focus:border-brand cursor-pointer text-[11px]"
              >
                <option value="all">Layer: All</option>
                {filterOptions.layers.map((layer) => (
                  <option key={layer} value={layer}>
                    {layer}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isFilteringActive && (
            <button
              onClick={resetFilters}
              className="text-brand hover:underline font-medium text-[11px] px-1.5 py-1 cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Explorer Body: Filtered List OR Folder Tree */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 max-h-[calc(100vh-320px)] sm:max-h-[700px]">
        {filteredFiles !== null ? (
          /* Search / Filter Results View */
          <div className="space-y-1">
            <div className="px-2 py-1 text-[11px] font-semibold text-ink-tertiary flex items-center justify-between">
              <span>Matching Files ({filteredFiles.length})</span>
            </div>

            {filteredFiles.length > 0 ? (
              filteredFiles.map((file) => {
                const isSelected = selectedFile === file.path
                const isEntryPoint = (model.entry_points || []).some(
                  (ep) => ep.path === file.path
                )

                return (
                  <button
                    key={file.path}
                    onClick={() => onSelectFile(file.path)}
                    className={`w-full text-left rounded-xl p-2.5 transition-all text-xs flex items-center justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? "bg-brand-surface border border-brand text-brand-text shadow-sm"
                        : "hover:bg-surface-inset border border-transparent text-ink"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileCodeIcon
                        className={`h-4 w-4 shrink-0 ${
                          isSelected ? "text-brand" : "text-ink-tertiary"
                        }`}
                      />
                      <div className="truncate">
                        <div className="font-mono font-medium truncate flex items-center gap-1.5">
                          <span>{file.name}</span>
                          {isEntryPoint && (
                            <ZapIcon className="h-3 w-3 text-brand shrink-0" title="Entry Point" />
                          )}
                        </div>
                        <div className="text-[10px] text-ink-tertiary truncate font-mono">
                          {file.path}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {file.category && file.category !== "unknown" && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-surface-inset border border-line-subtle text-ink-tertiary capitalize">
                          {file.category.replace("-", " ")}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })
            ) : (
              <div className="p-8 text-center text-xs text-ink-tertiary">
                No repository files match the current search or filters.
                <div className="mt-2">
                  <button
                    onClick={resetFilters}
                    className="text-brand hover:underline font-medium cursor-pointer"
                  >
                    Reset filters
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Tree View */
          <div className="space-y-2">
            {Object.entries(model.directories || {}).map(([folder, files]) => {
              const isOpen = openFolders[folder] ?? false

              return (
                <div key={folder} className="rounded-xl border border-line-subtle overflow-hidden">
                  <button
                    onClick={() => toggleFolder(folder)}
                    className="w-full flex items-center justify-between p-2.5 bg-surface-subtle/50 hover:bg-surface-inset transition-colors text-xs font-mono font-semibold text-ink cursor-pointer"
                  >
                    <div className="flex items-center gap-2 truncate">
                      {isOpen ? (
                        <ChevronDownIcon className="h-3.5 w-3.5 text-ink-tertiary shrink-0" />
                      ) : (
                        <ChevronRightIcon className="h-3.5 w-3.5 text-ink-tertiary shrink-0" />
                      )}
                      <FolderTreeIcon className="h-4 w-4 text-brand shrink-0" />
                      <span className="truncate">{folder === "." ? "Root" : folder}</span>
                    </div>
                    <span className="text-[10px] text-ink-tertiary font-sans font-normal shrink-0">
                      {files.length}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="p-1 space-y-0.5 bg-surface border-t border-line-subtle">
                      {files.map((fileName) => {
                        const fullPath = folder === "." ? fileName : `${folder}/${fileName}`
                        const isSelected = selectedFile === fullPath
                        const fileModel = model.files[fullPath]
                        const isEntryPoint = (model.entry_points || []).some(
                          (ep) => ep.path === fullPath
                        )
                        const hasRoutes = (model.api_routes || []).some(
                          (r) => r.file === fullPath
                        )

                        return (
                          <button
                            key={fullPath}
                            onClick={() => onSelectFile(fullPath)}
                            className={`w-full text-left pl-7 pr-2.5 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center justify-between gap-1.5 cursor-pointer ${
                              isSelected
                                ? "bg-brand-surface text-brand-text font-semibold border border-brand-border/60"
                                : "text-ink-secondary hover:text-ink hover:bg-surface-inset"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="h-1 w-1 rounded-full bg-ink-tertiary shrink-0" />
                              <span className="truncate">{fileName}</span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {isEntryPoint && (
                                <ZapIcon className="h-3 w-3 text-brand" title="Entry Point" />
                              )}
                              {hasRoutes && (
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="Defines API Routes" />
                              )}
                              {fileModel?.category && fileModel.category !== "unknown" && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-surface-inset text-ink-tertiary capitalize">
                                  {fileModel.category.replace("-", " ")}
                                </span>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default RepositoryExplorer
