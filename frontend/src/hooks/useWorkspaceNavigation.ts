import { useCallback, useEffect, useRef, useState } from "react"
import type { RepositoryModel } from "../types/repository"
import { readWorkspaceLink, sanitizeLocation, workspaceLink, type WorkspaceLocation, type WorkspaceView } from "../lib/workspaceNavigation"

type NavigationState = { entries: WorkspaceLocation[]; index: number }

export function useWorkspaceNavigation(model: RepositoryModel | undefined, projectId: string | null | undefined,
  allowed: WorkspaceView[], fallback: WorkspaceView, initialFile: string | null, initialTab?: string | null) {
  const [state, setState] = useState<NavigationState>(() => {
    const linked = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("view")
      ? readWorkspaceLink(window.location.search, model, allowed, fallback) : null
    const first = linked || sanitizeLocation({ view: allowed.includes(initialTab as WorkspaceView) ? initialTab as WorkspaceView : fallback,
      file: initialFile }, model, allowed, fallback)
    return { entries: [first], index: 0 }
  })
  const stateRef = useRef(state)
  stateRef.current = state
  const location = state.entries[state.index]

  const navigate = useCallback((change: Partial<WorkspaceLocation>, replace = false) => {
    const previous = stateRef.current
    const current = previous.entries[previous.index]
    const base = change.view && change.view !== current.view
      ? { ...current, story: null, step: null, presentation: false, graphMode: null, flow: null, trace: null, lifecycle: null,
        planType: null, planTarget: null, planDestination: null } : current
    const next = sanitizeLocation({ ...base, ...change }, model, allowed, fallback)
    if (JSON.stringify(next) === JSON.stringify(current)) return
    const entries = replace ? previous.entries.map((entry, index) => index === previous.index ? next : entry)
      : previous.entries.slice(0, previous.index + 1).concat(next)
    const index = replace ? previous.index : entries.length - 1
    const updated = { entries, index }
    stateRef.current = updated
    setState(updated)
    const url = workspaceLink(next, model, projectId)
    if (replace) window.history.replaceState({ repoExplainerIndex: index }, "", url)
    else window.history.pushState({ repoExplainerIndex: index }, "", url)
  }, [model, projectId, allowed, fallback])

  useEffect(() => {
    window.history.replaceState({ repoExplainerIndex: stateRef.current.index }, "",
      workspaceLink(stateRef.current.entries[stateRef.current.index], model, projectId))
    const onPop = (event: PopStateEvent) => {
      const index = event.state?.repoExplainerIndex
      const current = stateRef.current
      if (Number.isInteger(index) && index >= 0 && index < current.entries.length) {
        const updated = { ...current, index }
        stateRef.current = updated
        setState(updated)
      } else {
        const next = readWorkspaceLink(window.location.search, model, allowed, fallback)
        const updated = { entries: [next], index: 0 }
        stateRef.current = updated
        setState(updated)
      }
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [model, projectId, allowed, fallback])

  const back = useCallback(() => {
    if (stateRef.current.index > 0) window.history.back()
  }, [])
  const forward = useCallback(() => {
    if (stateRef.current.index < stateRef.current.entries.length - 1) window.history.forward()
  }, [])
  const view = location.view
  return { location, view, file: location.file, navigate, back, forward,
    canBack: state.index > 0, canForward: state.index < state.entries.length - 1 }
}
