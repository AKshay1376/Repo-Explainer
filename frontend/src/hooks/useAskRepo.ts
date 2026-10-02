/**
 * hooks/useAskRepo.ts
 * Manages Ask Repo conversational state, Server-Sent Events (SSE) streaming,
 * fallback HTTP fetching, and error recovery.
 */

import { useState, useCallback, useRef } from "react"
import type { AskMessage, AskRepoScope, AskResponsePayload } from "../types/qa"
import type { RepositoryModel } from "../types/repository"

interface UseAskRepoOptions {
  repoUrl: string
  repositoryModel?: RepositoryModel
}

export function useAskRepo({ repoUrl, repositoryModel }: UseAskRepoOptions) {
  const [messages, setMessages] = useState<AskMessage[]>([])
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)

  const clearConversation = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setMessages([])
    setError(null)
    setIsSubmitting(false)
  }, [])

  const sendMessage = useCallback(
    async (query: string, scope?: AskRepoScope) => {
      const trimmed = query.trim()
      if (!trimmed || isSubmitting) return

      setError(null)
      setIsSubmitting(true)

      const userMsgId = `user-${Date.now()}`
      const assistantMsgId = `asst-${Date.now() + 1}`

      const userMessage: AskMessage = {
        id: userMsgId,
        role: "user",
        content: trimmed,
        timestamp: Date.now(),
      }

      const initialAssistantMessage: AskMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        isStreaming: true,
      }

      // Add user message & pending assistant message
      setMessages((prev) => [...prev, userMessage, initialAssistantMessage])

      // Build bounded conversation history (last 6 messages)
      const currentHistory = [...messages, userMessage].slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const payload = {
        repo_url: repoUrl,
        query: trimmed,
        conversation_history: currentHistory,
        scoped_file: scope?.file || undefined,
        scoped_edge: scope?.edge || undefined,
        repository_model: repositoryModel || undefined,
      }

      // Prepare AbortController
      const controller = new AbortController()
      abortControllerRef.current = controller

      let streamSucceeded = false

      try {
        // Attempt SSE Streaming first
        const response = await fetch("/api/ask/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })

        if (response.ok && response.body) {
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let accumulatedText = ""
          let buffer = ""

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split("\n\n")
            buffer = lines.pop() || ""

            for (const block of lines) {
              const trimmedBlock = block.trim()
              if (!trimmedBlock.startsWith("data:")) continue

              const jsonStr = trimmedBlock.replace(/^data:\s*/, "")
              try {
                const eventData = JSON.parse(jsonStr)

                if (eventData.event === "chunk" && typeof eventData.text === "string") {
                  accumulatedText += eventData.text
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMsgId
                        ? { ...msg, content: accumulatedText }
                        : msg
                    )
                  )
                } else if (eventData.event === "done") {
                  streamSucceeded = true
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMsgId
                        ? {
                            ...msg,
                            content: accumulatedText || msg.content,
                            citations: eventData.citations || [],
                            relatedFiles: eventData.related_files || [],
                            confidence: eventData.confidence || "high",
                            evidenceSummary: eventData.evidence_summary || [],
                            intent: eventData.intent,
                            insufficientEvidence: eventData.insufficient_evidence,
                            isStreaming: false,
                          }
                        : msg
                    )
                  )
                }
              } catch {
                // Ignore JSON parse error in incomplete chunks
              }
            }
          }

          if (streamSucceeded) {
            setIsSubmitting(false)
            return
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError") {
          setIsSubmitting(false)
          return
        }
        // Fall back to standard JSON /api/ask if SSE failed
      }

      // Fallback: Standard JSON /api/ask
      try {
        const response = await fetch("/api/ask", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })

        const data: AskResponsePayload = await response.json()

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to generate answer.")
        }

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  content: data.answer,
                  citations: data.citations || [],
                  relatedFiles: data.related_files || [],
                  confidence: data.confidence || "high",
                  evidenceSummary: data.evidence_summary || [],
                  intent: data.intent,
                  insufficientEvidence: data.insufficient_evidence,
                  isStreaming: false,
                }
              : msg
          )
        )
      } catch (err: any) {
        if (err.name !== "AbortError") {
          const errMsg = err.message || "An error occurred while answering."
          setError(errMsg)
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? {
                    ...msg,
                    content: `⚠️ **Unable to complete answer:** ${errMsg}\n\nPlease check your question or try again.`,
                    isStreaming: false,
                  }
                : msg
            )
          )
        }
      } finally {
        setIsSubmitting(false)
      }
    },
    [isSubmitting, messages, repoUrl, repositoryModel]
  )

  return {
    messages,
    isSubmitting,
    error,
    sendMessage,
    clearConversation,
  }
}
