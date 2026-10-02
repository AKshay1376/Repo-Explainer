import React, { useEffect } from "react"
import { XIcon, ShieldCheckIcon } from "./ui/icons"

export type LegalDocType = "privacy" | "terms" | null

interface LegalModalProps {
  type: LegalDocType
  onClose: () => void
}

export const LegalModal: React.FC<LegalModalProps> = ({ type, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    if (type) {
      document.body.style.overflow = "hidden"
      window.addEventListener("keydown", handleKeyDown)
    }
    return () => {
      document.body.style.overflow = "unset"
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [type, onClose])

  if (!type) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm transition-opacity"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl apple-glass-panel p-6 sm:p-10 shadow-modal text-ink"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between pb-4 border-b border-line-subtle">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full apple-glass-control px-2.5 py-0.5 text-[11px] font-medium text-ink-secondary mb-1.5">
              <span>Draft for review</span>
            </div>
            <h2 id="legal-modal-title" className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
              {type === "privacy" ? "Privacy Policy" : "Terms of Service"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-ink-secondary hover:text-ink apple-glass-control transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <XIcon className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>

        <div className="mt-6 space-y-4 text-xs sm:text-sm text-ink-body leading-relaxed">
          {type === "privacy" ? (
            <>
              <p>
                <strong className="text-ink">1. Zero Data Retention:</strong> GitHub Repo Explainer operates on an ephemeral, in-memory analysis model. We do not store repository files, source code snippets, or user-submitted URLs in persistent databases.
              </p>
              <p>
                <strong className="text-ink">2. Public Repository Access:</strong> This tool only queries public data through the official GitHub REST API or explicitly configured tokens. We do not request private repository access or retain private repository credentials.
              </p>
              <p>
                <strong className="text-ink">3. Automated Secret Redaction:</strong> When repository files are retrieved for architecture analysis, all identified tokens, private keys, and passwords matching strict regex patterns are replaced with <code className="bg-[var(--color-code-inline-bg)] border border-[var(--color-code-inline-border)] px-1 py-0.5 rounded font-mono text-[var(--color-code-inline-text)]">[REDACTED SECRET]</code> prior to prompt formatting or report synthesis.
              </p>
              <p>
                <strong className="text-ink">4. Third-Party LLM Providers:</strong> When AI synthesis is enabled via OpenAI, only compact, sanitized file excerpts (capped at 6,000 characters per file) and folder hierarchies are transmitted. Untrusted source code is wrapped in strict prompt boundaries.
              </p>
              <p className="text-[11px] text-ink-tertiary italic pt-2">
                Note: This privacy disclosure is an operational draft reflecting the technical safeguards implemented in this repository.
              </p>
            </>
          ) : (
            <>
              <p>
                <strong className="text-ink">1. Permitted Use:</strong> GitHub Repo Explainer is provided as an open developer intelligence utility to assist engineers in understanding repository architecture, dependencies, and entry points.
              </p>
              <p>
                <strong className="text-ink">2. As-Is Provision:</strong> Generated technical reports and architectural diagrams are automated derivations based on AST parsing, dependency manifests, and heuristic scoring. Output is provided "as is" without warranty of completeness or fitness for critical production deployment decisions.
              </p>
              <p>
                <strong className="text-ink">3. Rate Limits & Quotas:</strong> Usage of the public GitHub API and OpenAI endpoints is subject to provider rate limits. When quota limits are reached, the application automatically invokes its deterministic fallback analyzer.
              </p>
              <p>
                <strong className="text-ink">4. Intellectual Property:</strong> All analyzed repository code remains the property of its respective authors and license holders. Generated reports are technical summaries and citations of the examined public trees.
              </p>
              <p className="text-[11px] text-ink-tertiary italic pt-2">
                Note: This terms agreement is an operational draft reflecting the technical capabilities and licensing parameters of this repository.
              </p>
            </>
          )}
        </div>

        <div className="mt-8 pt-4 border-t border-line-subtle flex justify-end">
          <button
            onClick={onClose}
            className="rounded-full bg-ctrl-btnPrimary px-5 py-2 text-xs font-medium text-ctrl-btnPrimaryText hover:bg-ctrl-btnPrimaryHover transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default LegalModal
