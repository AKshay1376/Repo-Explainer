/**
 * components/ExecutionFlow/StarterFlows.tsx
 * Contextual starter trace queries derived from detected repository capabilities.
 */

import React from "react"
import type { RepositoryModel } from "../../types/repository"
import type { TraceTrigger } from "../../types/trace"
import { SparklesIcon, RouteIcon, PlayIcon, DatabaseIcon } from "../ui/icons"

interface StarterFlowsProps {
  model?: RepositoryModel
  onSelectTrigger: (trigger: TraceTrigger) => void
}

export const StarterFlows: React.FC<StarterFlowsProps> = ({
  model,
  onSelectTrigger,
}) => {
  const suggestions = React.useMemo(() => {
    const list: Array<{ label: string; trigger: TraceTrigger; icon: React.ReactNode }> = []

    // 1. Check for authentication
    const hasAuth = Object.keys(model?.files || {}).some(
      (p) => p.toLowerCase().includes("auth") || p.toLowerCase().includes("login")
    )
    if (hasAuth) {
      list.push({
        label: "User Authentication Flow",
        trigger: { query: "login" },
        icon: <PlayIcon className="h-3 w-3 text-brand" />,
      })
    }

    // 2. First API Route
    if (model?.api_routes && model.api_routes.length > 0) {
      const topRoute = model.api_routes[0]
      list.push({
        label: `Trace ${topRoute.method} ${topRoute.path}`,
        trigger: { route: `${topRoute.method} ${topRoute.path}` },
        icon: <RouteIcon className="h-3 w-3 text-brand" />,
      })
    }

    // 3. Application Startup
    if (model?.entry_points && model.entry_points.length > 0) {
      const ep = model.entry_points[0]
      list.push({
        label: "Application Startup & Bootstrap",
        trigger: { query: "startup", startFile: ep.path },
        icon: <PlayIcon className="h-3 w-3 text-brand" />,
      })
    }

    // 4. Database Access
    if (model?.database_models && model.database_models.length > 0) {
      const db = model.database_models[0]
      list.push({
        label: `${db.name} Database Query Flow`,
        trigger: { query: db.name, startFile: db.file },
        icon: <DatabaseIcon className="h-3 w-3 text-brand" />,
      })
    }

    // Fallback generic suggestion if needed
    if (list.length === 0) {
      list.push({
        label: "Feature Execution Trace",
        trigger: { query: "main" },
        icon: <SparklesIcon className="h-3 w-3 text-brand" />,
      })
    }

    return list.slice(0, 4)
  }, [model])

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
        <SparklesIcon className="h-3.5 w-3.5 text-brand" />
        <span>Suggested Traces:</span>
      </div>
      {suggestions.map((item, idx) => (
        <button
          key={idx}
          onClick={() => onSelectTrigger(item.trigger)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-line-subtle bg-surface-inset px-3 py-1.5 text-xs text-ink hover:border-brand-border hover:bg-brand-surface/30 active:scale-[0.98] transition-all cursor-pointer shadow-subtle group"
        >
          {item.icon}
          <span className="font-medium group-hover:text-brand transition-colors">{item.label}</span>
        </button>
      ))}
    </div>
  )
}
