/**
 * frontend/src/components/ChangeImpact/BlastRadiusCard.tsx
 * Displays the primary blast radius metrics, deterministic risk score,
 * risk factor explanations, and optional "Explain Impact" trigger.
 */

import React from "react"
import type { BlastRadius, RiskLevel, ImpactAnalysis } from "../../types/impact"
import { ShieldCheckIcon, AlertCircleIcon, ZapIcon, SparklesIcon } from "../ui/icons"

interface BlastRadiusCardProps {
  analysis: ImpactAnalysis
  onExplainImpact?: (analysis: ImpactAnalysis) => void
}

const RISK_BADGES: Record<
  RiskLevel,
  { bg: string; text: string; border: string; icon: React.ReactNode; label: string }
> = {
  LOW: {
    bg: "bg-emerald-500/10 dark:bg-emerald-950/40",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
    icon: <ShieldCheckIcon className="w-4 h-4 text-emerald-400" />,
    label: "LOW RISK",
  },
  MEDIUM: {
    bg: "bg-amber-500/10 dark:bg-amber-950/40",
    text: "text-amber-400",
    border: "border-amber-500/30",
    icon: <AlertCircleIcon className="w-4 h-4 text-amber-400" />,
    label: "MEDIUM RISK",
  },
  HIGH: {
    bg: "bg-rose-500/10 dark:bg-rose-950/40",
    text: "text-rose-400",
    border: "border-rose-500/30",
    icon: <ZapIcon className="w-4 h-4 text-rose-400" />,
    label: "HIGH RISK",
  },
}

export const BlastRadiusCard: React.FC<BlastRadiusCardProps> = ({
  analysis,
  onExplainImpact,
}) => {
  const br = analysis.blast_radius
  const risk = RISK_BADGES[analysis.risk_level] || RISK_BADGES.LOW

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
      {/* Top row: Header, Risk Level badge, and Explain Action */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
            <ZapIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground tracking-tight flex items-center gap-2">
              Blast Radius Assessment
              <span className={`text-xs px-2 py-0.5 rounded-full border font-bold flex items-center gap-1.5 ${risk.bg} ${risk.text} ${risk.border}`}>
                {risk.icon}
                {risk.label}
              </span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Deterministic score: <span className="font-semibold text-foreground">{analysis.risk_score}</span>
              {" • "}Change Type: <span className="font-mono text-primary">{analysis.change_type}</span>
            </p>
          </div>
        </div>

        {onExplainImpact && (
          <button
            type="button"
            onClick={() => onExplainImpact(analysis)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 transition-colors shadow-sm"
          >
            <SparklesIcon className="w-3.5 h-3.5" />
            Explain Impact
          </button>
        )}
      </div>

      {/* Summary string */}
      {analysis.summary && (
        <div className="text-xs sm:text-sm text-foreground/90 bg-muted/30 border border-border/40 rounded-lg p-3 leading-relaxed">
          {analysis.summary}
        </div>
      )}

      {/* 6 Blast Radius Metric Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-background/80 border border-border/70 rounded-lg p-2.5 text-center">
          <div className="text-xl sm:text-2xl font-bold font-mono text-sky-400">
            {br.directly_affected}
          </div>
          <div className="text-[11px] font-medium text-muted-foreground mt-0.5">
            Direct Files
          </div>
        </div>

        <div className="bg-background/80 border border-border/70 rounded-lg p-2.5 text-center">
          <div className="text-xl sm:text-2xl font-bold font-mono text-indigo-400">
            {br.transitively_affected}
          </div>
          <div className="text-[11px] font-medium text-muted-foreground mt-0.5">
            Transitive Files
          </div>
        </div>

        <div className="bg-background/80 border border-border/70 rounded-lg p-2.5 text-center">
          <div className="text-xl sm:text-2xl font-bold font-mono text-amber-400">
            {br.tests_affected}
          </div>
          <div className="text-[11px] font-medium text-muted-foreground mt-0.5">
            Tests Exposed
          </div>
        </div>

        <div className="bg-background/80 border border-border/70 rounded-lg p-2.5 text-center">
          <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-400">
            {br.routes_affected}
          </div>
          <div className="text-[11px] font-medium text-muted-foreground mt-0.5">
            Routes Affected
          </div>
        </div>

        <div className="bg-background/80 border border-border/70 rounded-lg p-2.5 text-center">
          <div className="text-xl sm:text-2xl font-bold font-mono text-rose-400">
            {br.models_affected}
          </div>
          <div className="text-[11px] font-medium text-muted-foreground mt-0.5">
            Models Affected
          </div>
        </div>

        <div className="bg-background/80 border border-border/70 rounded-lg p-2.5 text-center bg-primary/5">
          <div className="text-xl sm:text-2xl font-bold font-mono text-primary">
            {br.total_affected}
          </div>
          <div className="text-[11px] font-semibold text-foreground mt-0.5">
            Total Impacted
          </div>
        </div>
      </div>

      {/* Risk Factors (if any) */}
      {analysis.risk_factors && analysis.risk_factors.length > 0 && (
        <div className="pt-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Contributing Risk Factors
          </div>
          <div className="flex flex-wrap gap-1.5">
            {analysis.risk_factors.map((factor, idx) => (
              <span
                key={idx}
                className="text-[11px] px-2 py-0.5 rounded bg-muted/50 border border-border text-foreground/80 font-mono"
              >
                • {factor}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Warnings & Truncations */}
      {analysis.warnings && analysis.warnings.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 text-xs text-amber-300 space-y-1">
          {analysis.warnings.map((w, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <AlertCircleIcon className="w-3.5 h-3.5 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
