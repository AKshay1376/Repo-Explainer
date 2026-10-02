import React, { useState } from "react"
import {
  ShieldCheckIcon,
  LayersIcon,
  FolderTreeIcon,
  CpuIcon,
  ServerIcon,
  GitBranchIcon,
  CheckIcon,
  FileCodeIcon,
  ArrowRightIcon,
  ChevronRightIcon,
} from "./ui/icons"

interface ProductStoryProps {
  onSelectSample: (url: string) => void
}

export const ProductStory: React.FC<ProductStoryProps> = ({ onSelectSample }) => {
  const [activeTab, setActiveTab] = useState<"architecture" | "evidence" | "files">("architecture")

  return (
    <div className="space-y-24 sm:space-y-36 py-12">
      {/* 1. SECTION: WHAT THE PRODUCT DOES (Overview) */}
      <section id="product-overview" className="scroll-mt-20 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary mb-3">
            Core Philosophy
          </p>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tightest text-ink leading-[1.12]">
            Evidence-grounded code intelligence. Not synthetic guesswork.
          </h2>
          <p className="mt-5 text-base sm:text-lg text-ink-secondary leading-relaxed">
            Most repository summaries produce vague generalities. Repo Explainer inspects actual AST nodes, dependency manifests, and entry points, classifying observations strictly into factual evidence and architectural inferences.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-10 border-t border-line-subtle pt-10">
          <div className="space-y-3">
            <div className="text-xs font-mono font-semibold text-brand">01 / INGESTION</div>
            <h3 className="text-lg font-semibold tracking-tight text-ink">
              Recursive Tree Ingestion
            </h3>
            <p className="text-sm text-ink-secondary leading-relaxed">
              Retrieves the complete Git tree through GitHub's recursive API. Filters test fixtures, compiled binaries, minified bundles, and vendored code to focus exclusively on primary application logic.
            </p>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-mono font-semibold text-brand">02 / HEURISTICS</div>
            <h3 className="text-lg font-semibold tracking-tight text-ink">
              AST & Entry Point Scoring
            </h3>
            <p className="text-sm text-ink-secondary leading-relaxed">
              Parses source files into Abstract Syntax Trees. Traces class definitions, function calls, and relative imports to model actual relationships between entry modules and backend services.
            </p>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-mono font-semibold text-brand">03 / SYNTHESIS</div>
            <h3 className="text-lg font-semibold tracking-tight text-ink">
              Calibrated Technical Report
            </h3>
            <p className="text-sm text-ink-secondary leading-relaxed">
              Synthesizes an architectural dossier. Every claim is labeled with its verification level: verified <code className="text-xs bg-[var(--color-code-inline-bg)] border border-[var(--color-code-inline-border)] text-[var(--color-code-inline-text)] px-1 py-0.5 rounded font-mono">FACT</code> or structural <code className="text-xs bg-[var(--color-code-inline-bg)] border border-[var(--color-code-inline-border)] text-[var(--color-code-inline-text)] px-1 py-0.5 rounded font-mono">INFERENCE</code>.
            </p>
          </div>
        </div>
      </section>

      {/* 2. SECTION: INTERACTIVE DEMONSTRATION OF REAL OUTPUT */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-line bg-surface p-6 sm:p-10 shadow-card">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-line-subtle">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                Inspection Case Study
              </span>
              <h3 className="text-2xl sm:text-4xl font-bold tracking-tight text-ink mt-1">
                Real Analysis: psf/requests
              </h3>
              <p className="text-sm text-ink-secondary mt-2 max-w-xl">
                Here is what Repo Explainer extracts when pointing at Python’s standard HTTP library.
              </p>
            </div>

            {/* 21st.dev style Segmented Control Switcher */}
            <div className="inline-flex rounded-xl apple-glass-control border border-line-subtle p-1 self-start md:self-auto shadow-subtle">
              <button
                onClick={() => setActiveTab("architecture")}
                className={`px-3.5 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
                  activeTab === "architecture"
                    ? "bg-surface text-ink shadow-subtle border border-brand-border/40 font-semibold"
                    : "text-ink-secondary hover:text-ink font-medium"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {activeTab === "architecture" && <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />}
                  <span>Architecture Flow</span>
                </span>
              </button>
              <button
                onClick={() => setActiveTab("evidence")}
                className={`px-3.5 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
                  activeTab === "evidence"
                    ? "bg-surface text-ink shadow-subtle border border-brand-border/40 font-semibold"
                    : "text-ink-secondary hover:text-ink font-medium"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {activeTab === "evidence" && <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />}
                  <span>Categorized Findings</span>
                </span>
              </button>
              <button
                onClick={() => setActiveTab("files")}
                className={`px-3.5 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
                  activeTab === "files"
                    ? "bg-surface text-ink shadow-subtle border border-brand-border/40 font-semibold"
                    : "text-ink-secondary hover:text-ink font-medium"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {activeTab === "files" && <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />}
                  <span>Inspected Modules</span>
                </span>
              </button>
            </div>
          </div>

          {/* Interactive Tab Content Display */}
          <div className="pt-8">
            {activeTab === "architecture" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-medium text-ink-secondary">
                    psf/requests // Component Architecture
                  </span>
                  <span className="text-xs text-brand-text font-medium bg-brand-soft border border-brand-border/40 px-2.5 py-0.5 rounded-full">
                    Deterministic verification
                  </span>
                </div>
                <div className="p-5 sm:p-6 bg-[#18181B] text-[#F4F4F5] rounded-2xl font-mono text-xs overflow-x-auto leading-relaxed border border-line-subtle">
{`User Request (api.py: get / post / request)
      │
      ▼ constructs
Session Layer (sessions.py: Session / SessionRedirectMixin)
      │  - Manages cookies, headers, auth, and connection persistence
      ▼ dispatches
Request Model (models.py: Request ➔ PreparedRequest)
      │  - Encodes parameters, headers, and body payloads
      ▼ routes to
Transport Adapter (adapters.py: HTTPAdapter / BaseAdapter)
      │  - Dispatches over urllib3 connection pools and manages TLS/retries
      ▼ returns
Response Model (models.py: Response)
      │  - Exposes status_code, headers, encoding, text, and json()`}
                </div>
                <p className="text-xs text-ink-secondary">
                  Constructed by verifying call signatures in <code className="bg-[var(--color-code-inline-bg)] border border-[var(--color-code-inline-border)] text-[var(--color-code-inline-text)] px-1 py-0.5 rounded">api.py</code>, session factories in <code className="bg-[var(--color-code-inline-bg)] border border-[var(--color-code-inline-border)] text-[var(--color-code-inline-text)] px-1 py-0.5 rounded">sessions.py</code>, and urllib3 pool dispatch in <code className="bg-[var(--color-code-inline-bg)] border border-[var(--color-code-inline-border)] text-[var(--color-code-inline-text)] px-1 py-0.5 rounded">adapters.py</code>.
                </p>
              </div>
            )}

            {activeTab === "evidence" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl border border-line-subtle bg-surface-inset space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded bg-[#EAF5EF] dark:bg-[#1D7A4A]/25 border border-[#1D7A4A]/30 dark:border-[#34C77B]/40 px-2 py-0.5 text-[11px] font-bold text-[#124A2D] dark:text-[#5CE69B]">
                      FACT
                    </span>
                    <span className="text-xs font-semibold text-ink">Layered HTTP Client Model</span>
                  </div>
                  <p className="text-xs text-ink-secondary leading-relaxed">
                    Source code confirms <code className="text-[11px] bg-[var(--color-code-inline-bg)] border border-[var(--color-code-inline-border)] text-[var(--color-code-inline-text)] px-1 py-0.5 rounded font-mono">requests.api.request()</code> instantiates a new <code className="text-[11px] bg-[var(--color-code-inline-bg)] border border-[var(--color-code-inline-border)] text-[var(--color-code-inline-text)] px-1 py-0.5 rounded font-mono">Session()</code> context on every standalone call, while persistent state is managed through the <code className="text-[11px] bg-[var(--color-code-inline-bg)] border border-[var(--color-code-inline-border)] text-[var(--color-code-inline-text)] px-1 py-0.5 rounded font-mono">Session</code> class.
                  </p>
                </div>

                <div className="p-5 rounded-2xl border border-line-subtle bg-surface-inset space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded bg-[#E8F0FE] dark:bg-[#1A73E8]/25 border border-[#1A73E8]/30 dark:border-[#8AB4F8]/40 px-2 py-0.5 text-[11px] font-bold text-[#174EA6] dark:text-[#A8C7FA]">
                      INFERENCE
                    </span>
                    <span className="text-xs font-semibold text-ink">Transport Decoupling</span>
                  </div>
                  <p className="text-xs text-ink-secondary leading-relaxed">
                    By mounting <code className="text-[11px] bg-[var(--color-code-inline-bg)] border border-[var(--color-code-inline-border)] text-[var(--color-code-inline-text)] px-1 py-0.5 rounded font-mono">HTTPAdapter</code> to URL prefixes, the architecture allows alternative network transports (e.g. SOCKS proxies, mock drivers) without altering public caller ergonomics.
                  </p>
                </div>

                <div className="p-5 rounded-2xl border border-line-subtle bg-surface-inset space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded bg-[#EAF5EF] dark:bg-[#1D7A4A]/25 border border-[#1D7A4A]/30 dark:border-[#34C77B]/40 px-2 py-0.5 text-[11px] font-bold text-[#124A2D] dark:text-[#5CE69B]">
                      FACT
                    </span>
                    <span className="text-xs font-semibold text-ink">Zero External Frameworks</span>
                  </div>
                  <p className="text-xs text-ink-secondary leading-relaxed">
                    Build manifests (<code className="text-[11px] bg-[var(--color-code-inline-bg)] border border-[var(--color-code-inline-border)] text-[var(--color-code-inline-text)] px-1 py-0.5 rounded font-mono">pyproject.toml</code>) rely on standard packaging PEP 517/621 with core dependencies centered strictly on <code className="text-[11px] bg-[var(--color-code-inline-bg)] border border-[var(--color-code-inline-border)] text-[var(--color-code-inline-text)] px-1 py-0.5 rounded font-mono">urllib3</code>, <code className="text-[11px] bg-[var(--color-code-inline-bg)] border border-[var(--color-code-inline-border)] text-[var(--color-code-inline-text)] px-1 py-0.5 rounded font-mono">certifi</code>, and <code className="text-[11px] bg-[var(--color-code-inline-bg)] border border-[var(--color-code-inline-border)] text-[var(--color-code-inline-text)] px-1 py-0.5 rounded font-mono">charset_normalizer</code>.
                  </p>
                </div>

                <div className="p-5 rounded-2xl border border-line-subtle bg-surface-inset space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded bg-[#FEF7E0] dark:bg-[#F9AB00]/25 border border-[#F9AB00]/30 dark:border-[#FDD663]/40 px-2 py-0.5 text-[11px] font-bold text-[#7A4B04] dark:text-[#FEE299]">
                      OBSERVED
                    </span>
                    <span className="text-xs font-semibold text-ink">Extensive Test Coverage</span>
                  </div>
                  <p className="text-xs text-ink-secondary leading-relaxed">
                    Inspected directory topology contains dedicated test harnesses using <code className="text-[11px] bg-[var(--color-code-inline-bg)] border border-[var(--color-code-inline-border)] text-[var(--color-code-inline-text)] px-1 py-0.5 rounded font-mono">pytest</code> with multi-platform matrix automation in GitHub Actions.
                  </p>
                </div>
              </div>
            )}

            {activeTab === "files" && (
              <div className="space-y-2">
                {[
                  { file: "src/requests/api.py", role: "Public top-level convenience functions: get(), post(), request()" },
                  { file: "src/requests/sessions.py", role: "Session lifecycle, cookie storage, and connection caching" },
                  { file: "src/requests/models.py", role: "Request, PreparedRequest, and Response representation" },
                  { file: "src/requests/adapters.py", role: "Transport adapter interface and urllib3 pool manager implementation" },
                  { file: "src/requests/auth.py", role: "HTTP Basic, Digest, and custom authentication handlers" },
                  { file: "pyproject.toml", role: "Build backend specification and packaging metadata" },
                ].map((item) => (
                  <div
                    key={item.file}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-line-subtle bg-surface-inset text-xs gap-1.5"
                  >
                    <div className="font-mono font-medium text-ink flex items-center gap-2">
                      <FileCodeIcon className="h-3.5 w-3.5 text-brand" strokeWidth={1.75} />
                      <span>{item.file}</span>
                    </div>
                    <div className="text-ink-secondary">{item.role}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 3. SECTION: 4 ARCHITECTURAL PILLARS (Warm surface tint & airy editorial layout) */}
      <section id="product-capabilities" className="scroll-mt-20 border-y border-line-subtle bg-surface-tint py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-16">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand mb-3">
              Engine Capabilities
            </p>
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tightest text-ink leading-[1.12]">
              Engineered with extreme discipline.
            </h2>
            <p className="mt-4 text-base text-ink-secondary leading-relaxed">
              Every layer of the analyzer is designed to operate safely, deterministically, and transparently on real repositories.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 sm:gap-16">
            {/* Pillar 1 */}
            <div className="space-y-4">
              <div className="h-10 w-10 rounded-xl bg-surface border border-line text-brand flex items-center justify-center shadow-subtle">
                <LayersIcon className="h-5 w-5 text-brand" strokeWidth={1.75} />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-ink">
                Deterministic Fallback Engine
              </h3>
              <p className="text-sm text-ink-secondary leading-relaxed">
                When external LLM quotas are exhausted, Repo Explainer doesn't fail or output generic placeholder copy. A local Python AST engine synthesizes relationship trees, entry-point tables, and module responsibilities directly from source evidence.
              </p>
            </div>

            {/* Pillar 2 */}
            <div className="space-y-4">
              <div className="h-10 w-10 rounded-xl bg-surface border border-line text-brand flex items-center justify-center shadow-subtle">
                <ShieldCheckIcon className="h-5 w-5 text-brand" strokeWidth={1.75} />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-ink">
                Zero-Leakage Security Engine
              </h3>
              <p className="text-sm text-ink-secondary leading-relaxed">
                All repository content is treated as untrusted input. Secrets, private keys, <code className="text-xs bg-[var(--color-code-inline-bg)] border border-[var(--color-code-inline-border)] text-[var(--color-code-inline-text)] px-1 py-0.5 rounded font-mono">.env</code> files, and authentication tokens are automatically detected and replaced with <code className="text-xs bg-[var(--color-code-inline-bg)] border border-[var(--color-code-inline-border)] text-[var(--color-code-inline-text)] px-1 py-0.5 rounded font-mono">[REDACTED SECRET]</code> before analysis.
              </p>
            </div>

            {/* Pillar 3 */}
            <div className="space-y-4">
              <div className="h-10 w-10 rounded-xl bg-surface border border-line text-brand flex items-center justify-center shadow-subtle">
                <GitBranchIcon className="h-5 w-5 text-brand" strokeWidth={1.75} />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-ink">
                Smart Key-File Selection
              </h3>
              <p className="text-sm text-ink-secondary leading-relaxed">
                Modern codebases contain thousands of files. An architecture-aware heuristic prioritizes core dispatchers (<code className="text-xs bg-[var(--color-code-inline-bg)] border border-[var(--color-code-inline-border)] text-[var(--color-code-inline-text)] px-1 py-0.5 rounded font-mono">main.py</code>, <code className="text-xs bg-[var(--color-code-inline-bg)] border border-[var(--color-code-inline-border)] text-[var(--color-code-inline-text)] px-1 py-0.5 rounded font-mono">index.ts</code>, <code className="text-xs bg-[var(--color-code-inline-bg)] border border-[var(--color-code-inline-border)] text-[var(--color-code-inline-text)] px-1 py-0.5 rounded font-mono">server.js</code>), config manifests, and internal routers while filtering noise.
              </p>
            </div>

            {/* Pillar 4 */}
            <div className="space-y-4">
              <div className="h-10 w-10 rounded-xl bg-surface border border-line text-brand flex items-center justify-center shadow-subtle">
                <CpuIcon className="h-5 w-5 text-brand" strokeWidth={1.75} />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-ink">
                Zero Fabricated Flow Arrows
              </h3>
              <p className="text-sm text-ink-secondary leading-relaxed">
                In multi-module repositories, independent subprojects are grouped by cluster. Flow arrows are only drawn when explicit import or call evidence exists between source and target files. If no verified link exists, the report explicitly states so.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. SECTION: TECHNICAL ARCHITECTURE & PIPELINE */}
      <section id="product-architecture" className="scroll-mt-20 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-line bg-surface p-8 sm:p-12 shadow-subtle">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand mb-2">
              System Architecture
            </p>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-ink">
              The 6-stage analysis pipeline.
            </h2>
            <p className="mt-3 text-sm text-ink-secondary leading-relaxed">
              How a single GitHub URL is validated, decomposed, sanitized, and transformed into an architectural document.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-6 gap-4">
            {[
              { step: "01", title: "Domain Validation", desc: "Regex & GitHub URL syntax verification (security.py)" },
              { step: "02", title: "Tree Traversal", desc: "Recursive Git tree retrieval & folder categorization" },
              { step: "03", title: "Stack Detection", desc: "Manifest matching: Python, Node, Go, Rust, Docker, etc." },
              { step: "04", title: "Key File Scoring", desc: "AST scoring to isolate top 8 architectural drivers" },
              { step: "05", title: "Redaction & Limits", desc: "Zero-leakage secret stripping & 6k char bounds" },
              { step: "06", title: "Synthesis", desc: "Grounded AI or deterministic AST report builder" },
            ].map((st) => (
              <div key={st.step} className="p-4 rounded-xl border border-line-subtle bg-surface-inset space-y-1.5 hover:border-brand-border/40 transition-colors">
                <span className="font-mono text-xs font-bold text-brand">{st.step}</span>
                <h4 className="text-xs font-bold text-ink">{st.title}</h4>
                <p className="text-[11px] text-ink-secondary leading-normal">{st.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. SECTION: ZERO-LEAKAGE SECURITY STANDARDS (Subtle warm illumination) */}
      <section id="product-security" className="scroll-mt-20 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-3xl bg-[#161518] border border-line text-white p-8 sm:p-14 shadow-float overflow-hidden">
          {/* Restrained brand ambient illumination */}
          <div className="pointer-events-none absolute -right-20 -bottom-20 w-80 h-80 bg-[radial-gradient(ellipse_at_center,rgba(255,92,32,0.12),transparent_70%)] blur-3xl" />

          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-border/40 bg-brand-soft px-3 py-1 text-xs font-medium text-brand">
              <ShieldCheckIcon className="h-3.5 w-3.5 text-brand" strokeWidth={2} />
              <span>Strict Zero-Leakage Policy</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tightest leading-tight text-white">
              Your source code is treated strictly as untrusted evidence.
            </h2>
            <p className="text-sm sm:text-base text-[#D4D4D8] leading-relaxed">
              We never execute untrusted repository scripts, never store private keys, and never send sensitive files across the network. All analysis operates on read-only public Git trees.
            </p>
          </div>

          <div className="relative z-10 mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 pt-8 border-t border-white/10">
            <div>
              <div className="text-sm font-semibold text-white">Automated Secret Redaction</div>
              <p className="mt-1.5 text-xs text-[#C9C9CE] leading-relaxed">
                API keys, bearer tokens, private keys, and passwords matching strict regex signatures are replaced before prompts or reports are generated.
              </p>
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Sensitive File Stripping</div>
              <p className="mt-1.5 text-xs text-[#C9C9CE] leading-relaxed">
                Known sensitive filenames like <code className="text-[#E4E4E7] font-mono">.env</code>, <code className="text-[#E4E4E7] font-mono">id_rsa</code>, and <code className="text-[#E4E4E7] font-mono">*.pem</code> are completely omitted from file inspections.
              </p>
            </div>
            <div>
              <div className="text-sm font-semibold text-white">XSS & Injection Protection</div>
              <p className="mt-1.5 text-xs text-[#C9C9CE] leading-relaxed">
                All Markdown output is rendered through safe AST tokenizers with strict URI sanitization, preventing cross-site scripting and prompt tampering.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. CALL TO ACTION SECTION */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center pt-8 pb-12">
        <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-ink">
          Ready to inspect a repository?
        </h2>
        <p className="mt-4 text-base text-ink-secondary max-w-xl mx-auto leading-relaxed">
          Select one of our verified references or scroll to the top to enter your own repository URL.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => {
              onSelectSample("https://github.com/psf/requests")
              window.scrollTo({ top: 0, behavior: "smooth" })
            }}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-xs font-semibold text-white shadow-subtle hover:bg-brand-hover active:scale-[0.98] transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span>Inspect psf/requests</span>
            <ArrowRightIcon className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          <button
            onClick={() => {
              onSelectSample("https://github.com/pallets/flask")
              window.scrollTo({ top: 0, behavior: "smooth" })
            }}
            className="inline-flex items-center gap-2 rounded-full apple-glass-control px-6 py-3 text-xs font-medium text-ink shadow-subtle hover:border-brand-border active:scale-[0.98] transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span>Inspect pallets/flask</span>
          </button>
        </div>
      </section>
    </div>
  )
}

export default ProductStory
