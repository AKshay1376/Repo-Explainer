/**
 * components/AskRepo/AskRepo.tsx
 * Primary Ask Repo view providing developer-focused, grounded codebase Q&A.
 */

import type { SourceLocation } from "../../types/source"
import React, { useRef, useEffect, useState } from "react"
import type { RepositoryModel } from "../../types/repository"
import type { AskRepoScope } from "../../types/qa"
import { useAskRepo } from "../../hooks/useAskRepo"
import { AskMessage } from "./AskMessage"
import { AskComposer } from "./AskComposer"
import { AskSuggestions } from "./AskSuggestions"
import {
  MessageSquareIcon,
  SparklesIcon,
  BotIcon,
  FileCodeIcon,
  CheckCircleIcon,
} from "../ui/icons"

interface AskRepoProps {
  repoUrl: string
  model?: RepositoryModel
  initialScope?: AskRepoScope
  onOpenSource?: (location: SourceLocation) => void
  onInspectFile: (filePath: string) => void
  onShowInGraph: (filePath: string) => void
  onTraceFlow?: (candidateFiles: string[], query?: string) => void
  onAnalyzeImpact?: (trigger: { file?: string }) => void
}

export const AskRepo: React.FC<AskRepoProps> = ({
  repoUrl,
  model,
  initialScope,
  onInspectFile,
  onOpenSource,
  onShowInGraph,
  onTraceFlow,
  onAnalyzeImpact,
}) => {
  const [activeScope, setActiveScope] = useState<AskRepoScope | undefined>(initialScope)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    messages,
    isSubmitting,
    error,
    sendMessage,
    clearConversation,
  } = useAskRepo({ repoUrl, repositoryModel: model })

  // Sync initial scope if parent changes it
  useEffect(() => {
    if (initialScope) {
      setActiveScope(initialScope)
    }
  }, [initialScope])

  // Scroll to bottom on updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = (query: string) => {
    sendMessage(query, activeScope)
  }

  const handleSelectPrompt = (prompt: string) => {
    sendMessage(prompt, activeScope)
  }

  const handleClearScope = () => {
    setActiveScope(undefined)
  }

  return (
    <div className="flex flex-col h-[780px] max-h-[85vh] rounded-3xl border border-line bg-surface shadow-card overflow-hidden text-ink">
      {/* 1. Header Bar */}
      <div className="flex items-center justify-between p-4 sm:p-5 border-b border-line bg-surface-subtle/50 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand text-white shadow-subtle">
            <MessageSquareIcon className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight text-ink flex items-center gap-2">
              <span>Ask Repo</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircleIcon className="h-3 w-3" />
                <span>Grounded Evidence</span>
              </span>
            </h2>
            <p className="text-xs text-ink-secondary">
              Ask natural-language questions grounded in AST symbols, imports, and routes.
            </p>
          </div>
        </div>

        {model && (
          <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-ink-tertiary">
            <span className="px-2 py-0.5 rounded-lg bg-surface-inset border border-line-subtle">
              {Object.keys(model.files || {}).length} files indexed
            </span>
          </div>
        )}
      </div>

      {/* 2. Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Welcome Empty State */}
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-surface text-brand border border-brand-border/40 shadow-card">
              <SparklesIcon className="h-8 w-8" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg sm:text-xl font-bold tracking-tight text-ink">
                Code Intelligence Q&A Assistant
              </h3>
              <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed max-w-md mx-auto">
                Ask about component interactions, API routes, data models, or reverse dependencies. Answers are backed by concrete repository evidence.
              </p>
            </div>

            {/* Grounding guarantees */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full text-left">
              <div className="p-3 rounded-2xl border border-line-subtle bg-surface-inset space-y-1">
                <span className="font-semibold text-xs text-ink flex items-center gap-1.5">
                  <CheckCircleIcon className="h-3.5 w-3.5 text-brand" />
                  <span>No Hallucinations</span>
                </span>
                <p className="text-[11px] text-ink-tertiary">Only references verified repository files, symbols, and routes.</p>
              </div>

              <div className="p-3 rounded-2xl border border-line-subtle bg-surface-inset space-y-1">
                <span className="font-semibold text-xs text-ink flex items-center gap-1.5">
                  <FileCodeIcon className="h-3.5 w-3.5 text-brand" />
                  <span>Clickable Citations</span>
                </span>
                <p className="text-[11px] text-ink-tertiary">Jump directly into FileInspector or ArchitectureGraph.</p>
              </div>

              <div className="p-3 rounded-2xl border border-line-subtle bg-surface-inset space-y-1">
                <span className="font-semibold text-xs text-ink flex items-center gap-1.5">
                  <SparklesIcon className="h-3.5 w-3.5 text-brand" />
                  <span>Reverse Traversal</span>
                </span>
                <p className="text-[11px] text-ink-tertiary">Instantly discover what files depend on any module or entity.</p>
              </div>
            </div>

            {/* Suggestions */}
            <div className="w-full pt-2">
              <AskSuggestions
                model={model}
                scope={activeScope}
                onSelectPrompt={handleSelectPrompt}
              />
            </div>
          </div>
        ) : (
          <>
            {/* Conversation message stream */}
            {messages.map((msg) => (
              <AskMessage
                key={msg.id}
                message={msg}
                onInspectFile={onInspectFile}
                onOpenSource={onOpenSource}
                onShowInGraph={onShowInGraph}
                onTraceFlow={onTraceFlow}
                onAnalyzeImpact={onAnalyzeImpact}
              />
            ))}

            {/* Follow-up suggestions at bottom */}
            {!isSubmitting && messages.length > 0 && (
              <div className="pt-2">
                <AskSuggestions
                  model={model}
                  scope={activeScope}
                  onSelectPrompt={handleSelectPrompt}
                />
              </div>
            )}
          </>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 3. Bottom Composer */}
      <div className="p-4 sm:p-5 border-t border-line bg-surface-subtle/30 shrink-0">
        <AskComposer
          onSend={handleSend}
          isSubmitting={isSubmitting}
          scope={activeScope}
          onClearScope={handleClearScope}
          onClearConversation={clearConversation}
          hasMessages={messages.length > 0}
        />
      </div>
    </div>
  )
}
export default AskRepo
