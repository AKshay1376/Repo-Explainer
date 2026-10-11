import React, { useEffect, useRef } from "react"
import { createPortal } from "react-dom"

interface Props {
  title: string
  onClose: () => void
  children: React.ReactNode
  className?: string
}

export function AccessibleDialog({ title, onClose, children, className = "max-w-xl" }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const oldOverflow = document.body.style.overflow
    const appRoot = document.getElementById("root")
    const wasInert = appRoot?.hasAttribute("inert") || false
    appRoot?.setAttribute("inert", "")
    document.body.style.overflow = "hidden"
    const target = panel.current?.querySelector<HTMLElement>("[data-initial-focus]")
      || panel.current?.querySelector<HTMLElement>("input, textarea")
      || panel.current?.querySelector<HTMLElement>("button, [tabindex]:not([tabindex='-1'])")
    ;(target || panel.current)?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); return }
      if (event.key !== "Tab" || !panel.current) return
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
      )).filter(element => element.offsetParent !== null)
      if (!focusable.length) { event.preventDefault(); panel.current.focus(); return }
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", onKeyDown, true)
    return () => {
      document.removeEventListener("keydown", onKeyDown, true)
      document.body.style.overflow = oldOverflow
      if (!wasInert) appRoot?.removeAttribute("inert")
      trigger?.focus()
    }
  }, [])

  const content = <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-3 sm:p-6" onMouseDown={event => {
    if (event.target === event.currentTarget) onClose()
  }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
      className={`w-full max-h-[90vh] overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-modal outline-none sm:p-6 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <button type="button" onClick={onClose} aria-label={`Close ${title}`} className="rounded-lg border border-line px-2 py-1 text-ink-secondary hover:text-ink">Close</button>
      </div>
      {children}
    </div>
  </div>
  return typeof document === "undefined" ? content : createPortal(content, document.body)
}

export function ConfirmDialog({ title, consequence, confirmLabel, onConfirm, onClose }: {
  title: string; consequence: string; confirmLabel: string; onConfirm: () => void; onClose: () => void
}) {
  return <AccessibleDialog title={title} onClose={onClose} className="max-w-md">
    <p className="text-sm text-ink-secondary">{consequence}</p>
    <div className="mt-6 flex justify-end gap-2">
      <button data-initial-focus onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button>
      <button onClick={onConfirm} className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white focus-visible:ring-2 focus-visible:ring-rose-500">{confirmLabel}</button>
    </div>
  </AccessibleDialog>
}
