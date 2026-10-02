import type { RepositoryModel } from "../types/repository"
import type { ExecutionStep } from "../types/trace"
import type { ImpactNode } from "../types/impact"
import type { SourceLocation, SourceMatch } from "../types/source"

export function parseSourceReference(value: string): SourceLocation | null {
  const match = /^(.+?):([1-9]\d*)(?:-([1-9]\d*))?$/.exec(value.trim())
  if (!match) return null
  const startLine = Number(match[2])
  const endLine = match[3] ? Number(match[3]) : startLine
  if (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || endLine < startLine) return null
  return { path: match[1].replace(/\\/g, "/"), startLine, endLine }
}

export function selectLineRange(current: SourceLocation, line: number, shift: boolean): SourceLocation {
  if (!Number.isSafeInteger(line) || line < 1) return current
  if (shift && current.startLine) {
    return { ...current, startLine: Math.min(current.startLine, line), endLine: Math.max(current.startLine, line) }
  }
  return { ...current, startLine: line, endLine: line }
}

export function findSourceMatches(content: string, query: string, caseSensitive = false): SourceMatch[] {
  if (!query) return []
  const needle = caseSensitive ? query : query.toLowerCase()
  const results: SourceMatch[] = []
  content.split("\n").forEach((line, index) => {
    const haystack = caseSensitive ? line : line.toLowerCase()
    let column = 0
    while ((column = haystack.indexOf(needle, column)) !== -1) {
      results.push({ line: index + 1, column: column + 1 })
      column += needle.length
    }
  })
  return results
}

export function knownSymbolLine(model: RepositoryModel, path: string, symbol?: string | null): number | undefined {
  if (!symbol) return undefined
  const normalized = path.replace(/\\/g, "/")
  const found = model.symbols?.find((item) =>
    item.file.replace(/\\/g, "/") === normalized && item.name === symbol &&
    typeof item.line === "number" && item.line > 0
  )
  return found?.line ?? undefined
}

export function sourceForStep(step: ExecutionStep, model: RepositoryModel): SourceLocation {
  const line = typeof step.line === "number" && step.line > 0
    ? step.line : knownSymbolLine(model, step.file, step.symbol)
  return { path: step.file, ...(line ? { startLine: line, endLine: line } : {}) }
}

export function sourceForImpact(node: Pick<ImpactNode, "file" | "symbol" | "line">, model: RepositoryModel): SourceLocation {
  const line = typeof node.line === "number" && node.line > 0
    ? node.line : knownSymbolLine(model, node.file, node.symbol)
  return { path: node.file, ...(line ? { startLine: line, endLine: line } : {}) }
}

export function githubSourceUrl(model: RepositoryModel, path: string, ref: string, startLine?: number, endLine?: number): string {
  const { owner, repo } = model.metadata
  const encodedPath = path.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/")
  const anchor = startLine && startLine > 0
    ? `#L${startLine}${endLine && endLine > startLine ? `-L${endLine}` : ""}` : ""
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/${encodeURIComponent(ref)}/${encodedPath}${anchor}`
}
