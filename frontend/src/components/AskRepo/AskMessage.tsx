/**
 * components/AskRepo/AskMessage.tsx
 * Renders user and assistant conversation turns with grounded markdown,
 * interactive file citations, confidence badges, and evidence summaries.
 */

import type { SourceLocation } from "../../types/source"
import React, { useState } from "react"
import type { AskMessage as AskMessageType } from "../../types/qa"
import { AskCitation } from "./AskCitation"
import { BotIcon, UserIcon, CheckCircleIcon, ChevronDownIcon, ChevronRightIcon, LayersIcon, WorkflowIcon, ZapIcon } from "../ui/icons"

interface AskMessageProps {
  message: AskMessageType
  onOpenSource?: (location: SourceLocation) => void
  onHumanize?: (path: string) => void
  onInspectFile?: (filePath: string) => void
  onShowInGraph?: (filePath: string) => void
  onTraceFlow?: (candidateFiles: string[], query?: string) => void
  onAnalyzeImpact?: (trigger: { file?: string }) => void
}

/**
 * Format markdown text into React elements, supporting:
 * - Code blocks (```lang ... ```)
 * - Markdown tables
 * - File citation links [label](file://path) -> interactive button
 * - Bold, italic, headers, bullet lists, inline code
 */
function renderGroundedMarkdown(
  text: string,
  onInspectFile?: (p: string) => void,
  onShowInGraph?: (p: string) => void
): React.ReactNode {
  if (!text) return null

  // Split text by code blocks ```
  const codeBlockRegex = /```([a-zA-Z0-9_\-]*)\n([\s\S]*?)```/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const beforeText = text.slice(lastIndex, match.index)
    if (beforeText) {
      parts.push(renderTextSections(beforeText, onInspectFile, onShowInGraph, `txt-${lastIndex}`))
    }

    const lang = match[1] || "text"
    const codeContent = match[2].trim()
    parts.push(
      <div key={`code-${match.index}`} className="my-3 rounded-xl border border-line bg-surface-inset p-3 overflow-x-auto text-xs font-mono">
        {lang && (
          <div className="text-[10px] uppercase font-semibold text-ink-tertiary mb-1 border-b border-line-subtle pb-1 select-none">
            {lang}
          </div>
        )}
        <pre className="text-ink leading-relaxed whitespace-pre font-mono">{codeContent}</pre>
      </div>
    )

    lastIndex = match.index + match[0].length
  }

  const remaining = text.slice(lastIndex)
  if (remaining) {
    parts.push(renderTextSections(remaining, onInspectFile, onShowInGraph, `txt-${lastIndex}`))
  }

  return <>{parts}</>
}

function renderTextSections(
  raw: string,
  onInspectFile?: (p: string) => void,
  onShowInGraph?: (p: string) => void,
  keyPrefix = "sec"
): React.ReactNode {
  const lines = raw.split("\n")
  const elements: React.ReactNode[] = []
  let tableRows: string[] = []

  const flushTable = (idx: number) => {
    if (tableRows.length === 0) return
    const rows = tableRows.map((r) =>
      r
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim())
    )
    tableRows = []

    if (rows.length < 2) return

    const headers = rows[0]
    // Filter out separator row (e.g. ---)
    const dataRows = rows.slice(1).filter((r) => !r.every((c) => /^:?-+:?$/.test(c)))

    elements.push(
      <div key={`table-${idx}`} className="my-3 overflow-x-auto rounded-xl border border-line bg-surface-inset text-xs">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-line bg-surface-subtle/60 text-ink-secondary text-[11px] font-semibold uppercase">
              {headers.map((h, hIdx) => (
                <th key={hIdx} className="p-2.5">
                  {renderInlineFormatting(h, onInspectFile, onShowInGraph)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle text-ink font-mono text-[11px]">
            {dataRows.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-surface/50 transition-colors">
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="p-2.5 font-sans">
                    {renderInlineFormatting(cell, onInspectFile, onShowInGraph)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  lines.forEach((line, i) => {
    const trimmed = line.trim()

    // Detect markdown table line
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      tableRows.push(trimmed)
      return
    } else if (tableRows.length > 0) {
      flushTable(i)
    }

    if (!trimmed) {
      elements.push(<div key={`${keyPrefix}-blank-${i}`} className="h-2" />)
      return
    }

    // Headers
    if (trimmed.startsWith("### ")) {
      elements.push(
        <h4 key={`${keyPrefix}-h4-${i}`} className="text-sm font-bold text-ink mt-3 mb-1 flex items-center gap-1.5">
          {renderInlineFormatting(trimmed.slice(4), onInspectFile, onShowInGraph)}
        </h4>
      )
    } else if (trimmed.startsWith("## ")) {
      elements.push(
        <h3 key={`${keyPrefix}-h3-${i}`} className="text-base font-bold text-ink mt-4 mb-1.5 border-b border-line pb-1">
          {renderInlineFormatting(trimmed.slice(3), onInspectFile, onShowInGraph)}
        </h3>
      )
    } else if (trimmed.startsWith("- ")) {
      // Bullet list item
      elements.push(
        <li key={`${keyPrefix}-li-${i}`} className="ml-4 list-disc text-ink-secondary leading-relaxed my-0.5">
          {renderInlineFormatting(trimmed.slice(2), onInspectFile, onShowInGraph)}
        </li>
      )
    } else {
      // Regular paragraph
      elements.push(
        <p key={`${keyPrefix}-p-${i}`} className="text-ink-secondary leading-relaxed my-1">
          {renderInlineFormatting(trimmed, onInspectFile, onShowInGraph)}
        </p>
      )
    }
  })

  if (tableRows.length > 0) {
    flushTable(lines.length)
  }

  return <div key={keyPrefix}>{elements}</div>
}

/**
 * Parses inline formatting:
 * - [label](file://path) or [label](file:///path) -> Interactive file link
 * - `code` -> inline code pill
 * - **bold** -> strong tag
 */
function renderInlineFormatting(
  text: string,
  onInspectFile?: (p: string) => void,
  onShowInGraph?: (p: string) => void
): React.ReactNode {
  // Regex parsing: links, inline codes, bold text
  const linkRegex = /\[([^\]]+)\]\(file:\/\/\/?([^)#\s]+)(?:#L(\d+))?\)/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = linkRegex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index)
    if (before) {
      parts.push(renderBasicInline(before))
    }

    const label = match[1]
    const filePath = match[2]
    const line = match[3] ? Number(match[3]) : undefined

    parts.push(
      <button
        key={`link-${match.index}`}
        onClick={() => onInspectFile?.(line ? `${filePath}:${line}` : filePath)}
        className="inline-flex items-center gap-1 font-mono text-[11px] text-brand hover:underline font-semibold bg-brand-surface/40 hover:bg-brand-surface px-1.5 py-0.5 rounded cursor-pointer mx-0.5 transition-colors"
        title={`Inspect ${filePath}`}
      >
        <span>{label}</span>
      </button>
    )

    lastIndex = match.index + match[0].length
  }

  const remaining = text.slice(lastIndex)
  if (remaining) {
    parts.push(renderBasicInline(remaining))
  }

  return <>{parts}</>
}

function renderBasicInline(text: string): React.ReactNode {
  // Simple replacement of `code` and **bold**
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return (
    <>
      {tokens.map((token, i) => {
        if (token.startsWith("`") && token.endsWith("`")) {
          return (
            <code
              key={i}
              className="rounded bg-surface-inset px-1.5 py-0.5 font-mono text-[11px] text-ink border border-line-subtle font-medium"
            >
              {token.slice(1, -1)}
            </code>
          )
        }
        if (token.startsWith("**") && token.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-ink">
              {token.slice(2, -2)}
            </strong>
          )
        }
        return token
      })}
    </>
  )
}

export const AskMessage: React.FC<AskMessageProps> = ({
  message,
  onInspectFile,
  onOpenSource,
  onHumanize,
  onShowInGraph,
  onTraceFlow,
  onAnalyzeImpact,
}) => {
  const isAssistant = message.role === "assistant"
  const [showEvidenceSummary, setShowEvidenceSummary] = useState(false)

  return (
    <div
      className={`flex gap-3 sm:gap-4 p-4 sm:p-5 rounded-3xl transition-all ${
        isAssistant
          ? "bg-surface border border-line shadow-card text-ink"
          : "bg-surface-inset border border-line-subtle text-ink ml-4 sm:ml-12"
      }`}
    >
      {/* Role Avatar */}
      <div className="shrink-0">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-2xl shadow-subtle ${
            isAssistant
              ? "bg-brand text-white"
              : "bg-surface-subtle text-ink-secondary border border-line"
          }`}
        >
          {isAssistant ? (
            <BotIcon className="h-4 w-4" />
          ) : (
            <UserIcon className="h-4 w-4" />
          )}
        </div>
      </div>

      {/* Message Body */}
      <div className="flex-1 space-y-3 overflow-hidden text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-xs tracking-tight text-ink">
            {isAssistant ? "Repo Explainer Assistant" : "You"}
          </span>

          {isAssistant && message.confidence && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border uppercase tracking-wider ${
                message.confidence === "high"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
              }`}
            >
              {message.confidence} Confidence
            </span>
          )}
        </div>

        {/* Content Body */}
        <div className="leading-relaxed">
          {isAssistant ? (
            message.content ? (
              renderGroundedMarkdown(message.content, (path) => {
                const match = /^(.*):([1-9]\d*)$/.exec(path)
                if (match && onOpenSource) onOpenSource({ path: match[1], startLine: Number(match[2]), endLine: Number(match[2]) })
                else onInspectFile?.(path)
              }, onShowInGraph)
            ) : message.isStreaming ? (
              <div className="flex items-center gap-2 text-ink-tertiary text-xs italic py-1 animate-pulse">
                <span>Gathering grounded repository evidence...</span>
              </div>
            ) : null
          ) : (
            <p className="whitespace-pre-wrap font-sans text-ink">{message.content}</p>
          )}

          {isAssistant && message.isStreaming && message.content && (
            <span className="inline-block h-3.5 w-1.5 ml-1 bg-brand animate-pulse align-middle" />
          )}
        </div>

        {/* Citations & Evidence Section */}
        {isAssistant && message.citations && message.citations.length > 0 && (
          <div className="border-t border-line-subtle pt-3 mt-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                <CheckCircleIcon className="h-3 w-3 text-brand" />
                <span>Grounded Citations ({message.citations.length})</span>
              </div>
              {onTraceFlow && !message.isStreaming && (
                <button
                  onClick={() => {
                    const files = (message.citations || []).map((c) => c.file).filter(Boolean)
                    onTraceFlow(files)
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all cursor-pointer"
                  title="Trace execution path through cited files"
                >
                  <WorkflowIcon className="h-3 w-3" />
                  <span>Trace Execution Flow</span>
                </button>
              )}
              {onAnalyzeImpact && !message.isStreaming && (
                <button
                  onClick={() => {
                    const files = (message.citations || []).map((c) => c.file).filter(Boolean)
                    if (files.length > 0) {
                      onAnalyzeImpact({ file: files[0] })
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-600 hover:text-white transition-all cursor-pointer"
                  title="Analyze change impact for cited files"
                >
                  <ZapIcon className="h-3 w-3" />
                  <span>Analyze Impact</span>
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {message.citations.map((c, idx) => (
                <AskCitation
                  key={idx}
                  citation={c}
                  onInspectFile={onInspectFile}
                  onOpenSource={onOpenSource}
                  onHumanize={onHumanize}
                  onShowInGraph={onShowInGraph}
                />
              ))}
            </div>
          </div>
        )}

        {/* Evidence Summary Collapsible */}
        {isAssistant && message.evidenceSummary && message.evidenceSummary.length > 0 && (
          <div className="border-t border-line-subtle pt-2 text-xs">
            <button
              onClick={() => setShowEvidenceSummary(!showEvidenceSummary)}
              className="flex items-center gap-1 text-[11px] font-medium text-ink-tertiary hover:text-brand transition-colors cursor-pointer"
            >
              {showEvidenceSummary ? (
                <ChevronDownIcon className="h-3 w-3" />
              ) : (
                <ChevronRightIcon className="h-3 w-3" />
              )}
              <span>Evidence Pipeline Details ({message.evidenceSummary.length})</span>
            </button>

            {showEvidenceSummary && (
              <div className="mt-2 rounded-xl bg-surface-inset border border-line-subtle p-2.5 space-y-1 animate-in fade-in duration-150">
                {message.evidenceSummary.map((ev, idx) => (
                  <div key={idx} className="text-[11px] text-ink-secondary flex items-start gap-1.5">
                    <span className="text-brand">•</span>
                    <span>{ev}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
