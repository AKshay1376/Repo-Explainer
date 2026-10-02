import React, { useEffect, useMemo, useState } from "react"
import type Prism from "prismjs"
import { loadSourceGrammar, sourceLines } from "./sourceHighlight"

interface SourceCodeProps {
  content: string
  language: string
  startLine?: number
  endLine?: number
  searchLines?: Set<number>
  onLineClick?: (line: number, shift: boolean) => void
  viewportRef?: React.RefObject<HTMLDivElement>
  onScrollPosition?: (top: number) => void
}

const ROW_HEIGHT = 22
const VIEW_HEIGHT = 560

export const SourceCode: React.FC<SourceCodeProps> = ({
  content, language, startLine, endLine, searchLines, onLineClick, viewportRef, onScrollPosition,
}) => {
  const [grammar, setGrammar] = useState<Prism.Grammar | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  useEffect(() => {
    let active = true
    setGrammar(null)
    loadSourceGrammar(language).then((loaded) => { if (active) setGrammar(loaded) }).catch(() => { if (active) setGrammar(null) })
    return () => { active = false }
  }, [language])

  const lineCount = useMemo(() => content.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n").length, [content])
  const virtual = lineCount > 10000
  const rows = useMemo(() => sourceLines(content, virtual ? null : grammar), [content, grammar, virtual])
  const first = virtual ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 40) : 0
  const last = virtual ? Math.min(rows.length, first + Math.ceil(VIEW_HEIGHT / ROW_HEIGHT) + 80) : rows.length
  const selectedEnd = endLine ?? startLine

  return (
    <div
      ref={viewportRef}
      className="source-code h-[560px] overflow-auto bg-surface-inset text-xs font-mono text-ink"
      onScroll={(event) => {
        const top = event.currentTarget.scrollTop
        setScrollTop(top)
        onScrollPosition?.(top)
      }}
      aria-label="Read-only source code"
    >
      <div style={{ minWidth: "max-content" }}>
        {virtual && <div style={{ height: first * ROW_HEIGHT }} />}
        {rows.slice(first, last).map((pieces, offset) => {
          const number = first + offset + 1
          const selected = !!startLine && number >= startLine && number <= (selectedEnd || startLine)
          const searchHit = searchLines?.has(number)
          return (
            <div
              key={number}
              data-line={number}
              className={`flex whitespace-pre ${selected ? "bg-brand-surface ring-1 ring-inset ring-brand-border/50" : searchHit ? "bg-amber-500/10" : ""}`}
              style={{ height: ROW_HEIGHT, lineHeight: `${ROW_HEIGHT}px` }}
            >
              <button
                type="button"
                className="sticky left-0 w-16 shrink-0 border-r border-line-subtle bg-surface-subtle/95 pr-3 text-right text-ink-tertiary select-none hover:text-brand"
                onClick={(event) => onLineClick?.(number, event.shiftKey)}
                aria-label={`Select line ${number}`}
              >{number}</button>
              <span className="px-4" aria-label={`Line ${number}`}>
                {pieces.length ? pieces.map((piece, index) => piece.tokenType
                  ? <span key={index} className={`token ${piece.tokenType}`}>{piece.text}</span>
                  : <React.Fragment key={index}>{piece.text}</React.Fragment>) : " "}
              </span>
            </div>
          )
        })}
        {virtual && <div style={{ height: (rows.length - last) * ROW_HEIGHT }} />}
      </div>
    </div>
  )
}
