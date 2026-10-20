import type { LifecycleSequence, LifecycleType } from "../types/story"

const paths: Record<LifecycleType, string[][]> = {
  patch: [
    ["draft", "ready", "approved", "applying", "applied", "validation_passed"],
    ["applied", "accepted"], ["ready", "rejected"], ["ready", "stale"],
    ["applying", "failed"], ["applied", "validation_failed", "rollback_available", "rolled_back"],
  ],
  validator: [
    ["untrusted", "trusted_once", "running", "passed"], ["untrusted", "trusted_repo", "running", "failed"],
    ["running", "timed_out"], ["running", "cancelled"],
  ],
  job: [["queued", "running", "completed"], ["running", "failed"], ["running", "cancelled"]],
  refactor: [["planned", "reviewed", "applying", "completed"], ["applying", "failed"], ["failed", "rolled_back"]],
  documentation: [["queued", "generating", "completed"], ["generating", "failed"], ["generating", "cancelled"]],
}
const labels: Record<string, string> = { trusted_once: "Trusted once", trusted_repo: "Trusted repo", timed_out: "Timed out",
  validation_passed: "Validation passed", validation_failed: "Validation failed", rollback_available: "Rollback available", rolled_back: "Rolled back" }
const patchAliases: Record<string, string> = {}

export function buildLifecycle(type: LifecycleType, actualStatus: string | null | undefined, detail?: string): LifecycleSequence {
  const current = type === "patch" ? patchAliases[actualStatus || ""] || actualStatus || null : actualStatus || null
  const allPaths = paths[type]
  const ids = [...new Set(allPaths.flat())]
  const known = current && ids.includes(current) ? current : null
  // Only the reported state is observed. Earlier states are possible, not asserted history.
  const reached = new Set(known ? [known] : [])
  return {
    type, current: known,
    states: ids.map(id => ({ id, label: labels[id] || id.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase()),
      current: id === known, reached: reached.has(id), possible: !reached.has(id) })),
    edges: [...new Map(allPaths.flatMap(path => path.slice(1).map((target, index) => {
      const source = path[index]; return [`${source}:${target}`, { source, target }] as const
    }))).values()],
    detail,
  }
}
