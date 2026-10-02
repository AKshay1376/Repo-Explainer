import type { PatchFile, PatchSet } from "../types/patch"

export const hunkIds = (files: PatchFile[]): string[] => files.flatMap((file) => file.hunks.map((hunk) => `${file.path}:${hunk.id}`))

export const toggleFile = (selected: string[], file: PatchFile): string[] => {
  const ids = hunkIds([file])
  return ids.every((id) => selected.includes(id))
    ? selected.filter((id) => !ids.includes(id))
    : [...new Set([...selected, ...ids])]
}

export const toggleHunk = (selected: string[], id: string, file?: PatchFile): string[] => {
  if (!file) return selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]
  const qualified = (hunkId: string) => `${file.path}:${hunkId}`
  const changed = new Set([id])
  let previousSize = -1
  while (previousSize !== changed.size) {
    previousSize = changed.size
    for (const hunk of file.hunks) {
      const own = qualified(hunk.id)
      if (selected.includes(id) && hunk.depends_on.some((dependency) => changed.has(qualified(dependency)))) changed.add(own)
      if (!selected.includes(id) && changed.has(own)) hunk.depends_on.forEach((dependency) => changed.add(qualified(dependency)))
    }
  }
  const result = new Set(selected.includes(id)
    ? selected.filter((item) => !changed.has(item)) : [...selected, ...changed])
  return [...selected.filter((item) => !item.startsWith(`${file.path}:`)),
    ...hunkIds([file]).filter((item) => result.has(item))]
}

export const canApplyPatch = (patch: PatchSet | null, selected: string[], validation: PatchSet["validation"] | null,
  confirmApply: boolean, highRisk: boolean, publicApi: boolean): boolean => Boolean(
  patch && patch.status === "ready" && selected.length > 0 &&
  (validation?.state === "PASSED" || validation?.state === "PARTIAL") && confirmApply &&
  (patch.risk_level !== "HIGH" || highRisk) &&
  (!patch.files.some((file) => file.public_api_change) || publicApi)
  && (!(patch.source === "planner" || patch.source === "verified") || (patch.confidence ?? "HIGH") === "HIGH")
)
