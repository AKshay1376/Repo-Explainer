/**
 * components/AskRepo/AskSuggestions.tsx
 * Contextually aware starter prompts derived from repository architecture,
 * files, routes, and developer scope.
 */

import React from "react"
import type { RepositoryModel } from "../../types/repository"
import type { AskRepoScope } from "../../types/qa"
import { SparklesIcon, FileCodeIcon, LinkIcon, RouteIcon, DatabaseIcon } from "../ui/icons"

interface AskSuggestionsProps {
  model?: RepositoryModel
  scope?: AskRepoScope
  onSelectPrompt: (prompt: string) => void
}

export const AskSuggestions: React.FC<AskSuggestionsProps> = ({
  model,
  scope,
  onSelectPrompt,
}) => {
  const suggestions = React.useMemo(() => {
    const list: Array<{ label: string; prompt: string; icon: React.ReactNode }> = []

    // 1. Scoped File Suggestions
    if (scope?.file) {
      const fileName = scope.file.split("/").pop() || scope.file
      list.push({
        label: `What files depend on ${fileName}?`,
        prompt: `What files depend on ${scope.file}? List all reverse dependents.`,
        icon: <LinkIcon className="h-3.5 w-3.5 text-brand" />,
      })
      list.push({
        label: `What does ${fileName} import?`,
        prompt: `What internal and external dependencies does ${scope.file} import?`,
        icon: <FileCodeIcon className="h-3.5 w-3.5 text-brand" />,
      })
      list.push({
        label: `Explain responsibilities of ${fileName}`,
        prompt: `Explain the architectural purpose, main classes, and functions of ${scope.file}.`,
        icon: <SparklesIcon className="h-3.5 w-3.5 text-brand" />,
      })
      return list
    }

    // 2. Scoped Edge Suggestions
    if (scope?.edge) {
      const srcName = scope.edge.source.split("/").pop() || scope.edge.source
      const tgtName = scope.edge.target.split("/").pop() || scope.edge.target
      list.push({
        label: `How does ${srcName} interact with ${tgtName}?`,
        prompt: `Explain the relationship and data flow between ${scope.edge.source} and ${scope.edge.target} (${scope.edge.type}).`,
        icon: <LinkIcon className="h-3.5 w-3.5 text-brand" />,
      })
      return list
    }

    // 3. Global Dynamic Suggestions based on Repository Model
    if (model?.entry_points && model.entry_points.length > 0) {
      list.push({
        label: "How does the application start?",
        prompt: "How does the application start and initialize? What is the main entry point flow?",
        icon: <SparklesIcon className="h-3.5 w-3.5 text-brand" />,
      })
    }

    if (model?.api_routes && model.api_routes.length > 0) {
      list.push({
        label: `List all API routes (${model.api_routes.length})`,
        prompt: "List all API routes and HTTP endpoints exposed by the repository, including methods and handlers.",
        icon: <RouteIcon className="h-3.5 w-3.5 text-brand" />,
      })
    }

    if (model?.database_models && model.database_models.length > 0) {
      list.push({
        label: `Explain database models (${model.database_models.length})`,
        prompt: "What database models or entities are defined in this repository, and what are their relationships?",
        icon: <DatabaseIcon className="h-3.5 w-3.5 text-brand" />,
      })
    }

    list.push({
      label: "Where is authentication handled?",
      prompt: "Where is user authentication, token validation, or session management implemented?",
      icon: <SparklesIcon className="h-3.5 w-3.5 text-brand" />,
    })

    list.push({
      label: "Explain the architecture layers",
      prompt: "Explain the architectural layers of this repository and how components interact across boundaries.",
      icon: <SparklesIcon className="h-3.5 w-3.5 text-brand" />,
    })

    return list.slice(0, 5)
  }, [model, scope])

  if (suggestions.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
        <SparklesIcon className="h-3.5 w-3.5 text-brand" />
        <span>Suggested Questions</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((item, idx) => (
          <button
            key={idx}
            onClick={() => onSelectPrompt(item.prompt)}
            className="inline-flex items-center gap-2 rounded-xl border border-line-subtle bg-surface-inset px-3 py-1.5 text-xs text-ink transition-all hover:border-brand-border hover:bg-brand-surface/30 active:scale-[0.98] cursor-pointer text-left shadow-subtle group"
          >
            <span className="shrink-0">{item.icon}</span>
            <span className="group-hover:text-brand font-medium transition-colors">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
