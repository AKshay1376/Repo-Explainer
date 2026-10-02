import React, { useState } from "react"
import ReactMarkdown from "react-markdown"
import { CheckIcon, CopyIcon, FileTextIcon } from "./ui/icons"

interface ReportViewProps {
  reportMarkdown: string
}

export const ReportView: React.FC<ReportViewProps> = ({ reportMarkdown }) => {
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null)

  const handleCopyCode = (text: string, index: number) => {
    navigator.clipboard.writeText(text)
    setCopiedCodeIndex(index)
    setTimeout(() => setCopiedCodeIndex(null), 2000)
  }

  let codeBlockCounter = 0

  return (
    <div className="report-content max-w-none text-ink">
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink border-b border-line pb-3 mb-6 flex items-center gap-2.5">
              <FileTextIcon className="h-6 w-6 text-brand" strokeWidth={1.75} />
              <span>{children}</span>
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-ink border-b border-line pb-2 mt-8 mb-4">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold tracking-tight text-ink mt-6 mb-2">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="my-2.5 text-sm leading-relaxed text-ink-body">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="my-2.5 space-y-1.5 list-disc pl-5 text-sm text-ink-body">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2.5 space-y-1.5 list-decimal pl-5 text-sm text-ink-body">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed pl-1 text-ink-body">
              {children}
            </li>
          ),
          strong: ({ children }) => {
            const text = String(children || "").trim()
            if (text.startsWith("FACT")) {
              return (
                <span className="inline-flex items-center rounded bg-[#EAF5EF] dark:bg-[#1D7A4A]/25 border border-[#1D7A4A]/30 dark:border-[#34C77B]/40 px-2 py-0.5 text-[11px] font-bold text-[#124A2D] dark:text-[#5CE69B] mr-1.5 shadow-subtle">
                  FACT
                </span>
              )
            }
            if (text.startsWith("INFERENCE")) {
              return (
                <span className="inline-flex items-center rounded bg-[#E8F0FE] dark:bg-[#1A73E8]/25 border border-[#1A73E8]/30 dark:border-[#8AB4F8]/40 px-2 py-0.5 text-[11px] font-bold text-[#174EA6] dark:text-[#A8C7FA] mr-1.5 shadow-subtle">
                  INFERENCE
                </span>
              )
            }
            if (text.startsWith("RECOMMENDATION")) {
              return (
                <span className="inline-flex items-center rounded bg-[#F3E8FD] dark:bg-[#8430CE]/25 border border-[#8430CE]/30 dark:border-[#C58AF9]/40 px-2 py-0.5 text-[11px] font-bold text-[#6200EE] dark:text-[#E8D0FD] mr-1.5 shadow-subtle">
                  RECOMMENDATION
                </span>
              )
            }
            if (text.startsWith("OBSERVED")) {
              return (
                <span className="inline-flex items-center rounded bg-[#FEF7E0] dark:bg-[#F9AB00]/25 border border-[#F9AB00]/30 dark:border-[#FDD663]/40 px-2 py-0.5 text-[11px] font-bold text-[#7A4B04] dark:text-[#FEE299] mr-1.5 shadow-subtle">
                  OBSERVED
                </span>
              )
            }
            return <strong className="font-semibold text-ink">{children}</strong>
          },
          code: ({ inline, className, children, ...props }: any) => {
            const codeString = String(children).replace(/\n$/, "")
            const isInline = inline || (!className && !String(children).includes("\n"))
            if (isInline) {
              return (
                <code className="rounded bg-[var(--color-code-inline-bg)] border border-[var(--color-code-inline-border)] px-1.5 py-0.5 font-mono text-xs text-[var(--color-code-inline-text)] break-words">
                  {children}
                </code>
              )
            }

            const currentIdx = codeBlockCounter++
            const isCopied = copiedCodeIndex === currentIdx

            return (
              <div className="relative my-4 rounded-2xl border border-[#27272A] bg-[#18181B] overflow-hidden shadow-subtle">
                <div className="flex items-center justify-between border-b border-[#27272A] bg-[#222225] px-4 py-2 text-xs text-[#D1D1D6]">
                  <span className="font-mono text-[11px]">
                    {className ? className.replace("language-", "") : "terminal"}
                  </span>
                  <button
                    onClick={() => handleCopyCode(codeString, currentIdx)}
                    className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[11px] text-[#F4F4F5] hover:bg-white/20 transition-colors cursor-pointer"
                  >
                    {isCopied ? (
                      <>
                        <CheckIcon className="h-3 w-3 text-emerald-400" strokeWidth={2} />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <CopyIcon className="h-3 w-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-4 overflow-x-auto text-xs font-mono text-[#F4F4F5] leading-relaxed">
                  <code>{children}</code>
                </pre>
              </div>
            )
          },
          details: ({ children }) => (
            <details className="my-4 rounded-xl border border-line-subtle bg-surface-inset p-4 group">
              {children}
            </details>
          ),
          summary: ({ children }) => (
            <summary className="cursor-pointer font-medium text-brand hover:text-brand-hover select-none py-1">
              {children}
            </summary>
          ),
          a: ({ href, children }) => {
            const isSafe = href && (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("#"))
            if (!isSafe) {
              return <span>{children}</span>
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:text-brand-hover underline underline-offset-2 transition-colors"
              >
                {children}
              </a>
            )
          },
        }}
      >
        {reportMarkdown}
      </ReactMarkdown>
    </div>
  )
}

export default ReportView

