import { apiFetch } from "../apiClient"
import { useCallback, useState } from "react"
import type { DocSection, DocumentTarget, GeneratedDocument } from "../types/documentation"
import type { RepositoryModel } from "../types/repository"

export function useDocumentation(repoUrl: string, model: RepositoryModel) {
  const [document, setDocument] = useState<GeneratedDocument | null>(null)
  const [currentReadme, setCurrentReadme] = useState<string | null>(null)
  const [readmeDraft, setReadmeDraft] = useState<string | null>(null)
  const [readmePatchReady, setReadmePatchReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const request = useCallback(async <T,>(endpoint: string, payload: Record<string, unknown>): Promise<T> => {
    const response = await apiFetch(`/api/docs/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_url: repoUrl, repository_model: model, ...payload }) })
    const result = await response.json()
    if (!response.ok || !result.success) throw new Error(result.error || "Documentation request failed.")
    return result as T
  }, [repoUrl, model])
  const generate = useCallback(async (target: DocumentTarget) => {
    setLoading(true); setError("")
    try {
      if (target.type === "README_DRAFT") {
        const result = await request<{ document: GeneratedDocument; current_readme: string | null; draft_markdown: string; readme_patch_ready: boolean }>("readme", { scope: target.scope, options: target.options })
        setDocument(result.document); setCurrentReadme(result.current_readme); setReadmeDraft(result.draft_markdown); setReadmePatchReady(result.readme_patch_ready)
      } else {
        setDocument(await request<GeneratedDocument>("generate", { type: target.type, scope: target.scope, options: target.options }))
        setCurrentReadme(null); setReadmeDraft(null); setReadmePatchReady(false)
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Documentation generation failed.") }
    finally { setLoading(false) }
  }, [request])
  const regenerateSection = useCallback(async (target: DocumentTarget, sectionId: string) => {
    if (target.type === "README_DRAFT") { await generate(target); return }
    const result = await request<{ section: DocSection }>("section", { type: target.type, scope: target.scope, options: target.options, section_id: sectionId })
    setDocument(previous => previous ? { ...previous, sections: previous.sections.map(item => item.id === sectionId ? result.section : item) } : previous)
  }, [generate, request])
  const download = useCallback(async (format: "markdown" | "html" | "json") => {
    if (!document) return
    const response = await apiFetch("/api/docs/export", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_url: repoUrl, document_id: document.id, format }) })
    if (!response.ok) throw new Error("Document export failed.")
    const blob = await response.blob(); const url = URL.createObjectURL(blob)
    const anchor = window.document.createElement("a"); anchor.href = url
    anchor.download = `${document.type.toLowerCase()}.${format === "markdown" ? "md" : format === "html" ? "html" : "json"}`
    anchor.click(); URL.revokeObjectURL(url)
  }, [document, repoUrl])
  return { document, currentReadme, readmeDraft, readmePatchReady, loading, error, generate, regenerateSection, download, request }
}
