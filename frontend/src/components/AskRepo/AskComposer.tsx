/**
 * components/AskRepo/AskComposer.tsx
 * Input composer for developer queries with active scope badge and clear controls.
 */

import React, { useState, useRef, useEffect } from "react"
import type { AskRepoScope } from "../../types/qa"
import { SendIcon, XIcon, RotateCcwIcon, TagIcon } from "../ui/icons"

interface AskComposerProps {
  onSend: (query: string) => void
  isSubmitting: boolean
  scope?: AskRepoScope
  onClearScope?: () => void
  onClearConversation?: () => void
  hasMessages?: boolean
}

export const AskComposer: React.FC<AskComposerProps> = ({
  onSend,
  isSubmitting,
  scope,
  onClearScope,
  onClearConversation,
  hasMessages = false,
}) => {
  const [text, setText] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!text.trim() || isSubmitting) return
    onSend(text.trim())
    setText("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`
    }
  }

  const scopedEntity = scope?.file
    ? scope.file.split("/").pop() || scope.file
    : scope?.edge
    ? `${scope.edge.source.split("/").pop()} → ${scope.edge.target.split("/").pop()}`
    : null

  return (
    <div className="space-y-3">
      {/* Active Scope Badge */}
      {scopedEntity && (
        <div className="flex items-center justify-between rounded-xl border border-brand-border/60 bg-brand-surface/40 px-3 py-1.5 text-xs text-ink animate-in fade-in duration-200">
          <div className="flex items-center gap-2 truncate">
            <TagIcon className="h-3.5 w-3.5 text-brand shrink-0" />
            <span className="text-ink-secondary text-[11px]">Scoped to:</span>
            <span className="font-mono font-semibold text-brand truncate">{scopedEntity}</span>
          </div>
          {onClearScope && (
            <button
              onClick={onClearScope}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-ink-secondary hover:text-ink hover:bg-surface-inset transition-colors cursor-pointer"
              title="Clear active scope"
            >
              <XIcon className="h-3.5 w-3.5" />
              <span>Clear Scope</span>
            </button>
          )}
        </div>
      )}

      {/* Input Box Form */}
      <form
        onSubmit={handleSubmit}
        className="relative flex flex-col rounded-2xl border border-line bg-surface p-2.5 shadow-card transition-all focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20"
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            handleInput()
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            scopedEntity
              ? `Ask a question scoped to ${scopedEntity}...`
              : "Ask anything about architecture, flow, files, routes, or dependencies..."
          }
          rows={2}
          disabled={isSubmitting}
          className="w-full resize-none bg-transparent p-2 text-sm text-ink placeholder:text-ink-tertiary focus:outline-none max-h-44 leading-relaxed font-sans"
        />

        <div className="flex items-center justify-between border-t border-line-subtle pt-2 mt-1">
          <div className="flex items-center gap-2">
            {hasMessages && onClearConversation && (
              <button
                type="button"
                onClick={onClearConversation}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-ink-tertiary hover:text-ink hover:bg-surface-inset transition-colors cursor-pointer"
                title="Clear conversation history"
              >
                <RotateCcwIcon className="h-3 w-3" />
                <span>Reset Chat</span>
              </button>
            )}
            <span className="text-[11px] text-ink-tertiary hidden sm:inline">
              Press <kbd className="px-1.5 py-0.5 rounded border border-line bg-surface-inset font-mono text-[10px]">Enter</kbd> to send, <kbd className="px-1.5 py-0.5 rounded border border-line bg-surface-inset font-mono text-[10px]">Shift+Enter</kbd> for newline
            </span>
          </div>

          <button
            type="submit"
            disabled={!text.trim() || isSubmitting}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold shadow-subtle transition-all cursor-pointer ${
              text.trim() && !isSubmitting
                ? "bg-brand text-white hover:bg-brand-hover active:scale-[0.98]"
                : "bg-surface-inset text-ink-tertiary border border-line-subtle cursor-not-allowed"
            }`}
          >
            {isSubmitting ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                <span>Answering...</span>
              </>
            ) : (
              <>
                <span>Ask</span>
                <SendIcon className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
