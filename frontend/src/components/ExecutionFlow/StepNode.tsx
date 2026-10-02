/**
 * components/ExecutionFlow/StepNode.tsx
 * Custom React Flow node representing an individual execution step in the flow.
 */

import React from "react"
import { Handle, Position } from "@xyflow/react"
import type { ExecutionStep, StepType } from "../../types/trace"
import {
  FileCodeIcon,
  RouteIcon,
  DatabaseIcon,
  ComponentIcon,
  ZapIcon,
  LayersIcon,
} from "../ui/icons"

interface StepNodeProps {
  data: {
    step: ExecutionStep
    isSelected: boolean
    stepNumber: number
    totalSteps: number
    direction: "TB" | "LR"
  }
}

const STEP_TYPE_CONFIG: Record<
  StepType,
  { label: string; color: string; border: string; bg: string; icon: React.ReactNode }
> = {
  UI_COMPONENT: {
    label: "UI COMPONENT",
    color: "text-purple-600 dark:text-purple-400",
    border: "border-purple-500/30",
    bg: "bg-purple-500/10",
    icon: <ComponentIcon className="h-3 w-3" />,
  },
  EVENT_HANDLER: {
    label: "EVENT HANDLER",
    color: "text-indigo-600 dark:text-indigo-400",
    border: "border-indigo-500/30",
    bg: "bg-indigo-500/10",
    icon: <ZapIcon className="h-3 w-3" />,
  },
  CLIENT_SERVICE: {
    label: "CLIENT SERVICE",
    color: "text-blue-600 dark:text-blue-400",
    border: "border-blue-500/30",
    bg: "bg-blue-500/10",
    icon: <FileCodeIcon className="h-3 w-3" />,
  },
  API_CLIENT: {
    label: "API CLIENT",
    color: "text-sky-600 dark:text-sky-400",
    border: "border-sky-500/30",
    bg: "bg-sky-500/10",
    icon: <ZapIcon className="h-3 w-3" />,
  },
  API_ROUTE: {
    label: "API ROUTE",
    color: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/10",
    icon: <RouteIcon className="h-3 w-3" />,
  },
  MIDDLEWARE: {
    label: "MIDDLEWARE",
    color: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/30",
    bg: "bg-amber-500/10",
    icon: <LayersIcon className="h-3 w-3" />,
  },
  CONTROLLER: {
    label: "CONTROLLER",
    color: "text-teal-600 dark:text-teal-400",
    border: "border-teal-500/30",
    bg: "bg-teal-500/10",
    icon: <FileCodeIcon className="h-3 w-3" />,
  },
  SERVICE: {
    label: "SERVICE",
    color: "text-blue-600 dark:text-blue-400",
    border: "border-blue-500/30",
    bg: "bg-blue-500/10",
    icon: <FileCodeIcon className="h-3 w-3" />,
  },
  MODEL: {
    label: "MODEL",
    color: "text-rose-600 dark:text-rose-400",
    border: "border-rose-500/30",
    bg: "bg-rose-500/10",
    icon: <DatabaseIcon className="h-3 w-3" />,
  },
  DATABASE: {
    label: "DATABASE",
    color: "text-orange-600 dark:text-orange-400",
    border: "border-orange-500/30",
    bg: "bg-orange-500/10",
    icon: <DatabaseIcon className="h-3 w-3" />,
  },
  UTILITY: {
    label: "UTILITY",
    color: "text-slate-600 dark:text-slate-400",
    border: "border-slate-500/30",
    bg: "bg-slate-500/10",
    icon: <FileCodeIcon className="h-3 w-3" />,
  },
  ENTRY_POINT: {
    label: "ENTRY POINT",
    color: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/10",
    icon: <ZapIcon className="h-3 w-3" />,
  },
  UNKNOWN: {
    label: "MODULE",
    color: "text-slate-500",
    border: "border-slate-500/30",
    bg: "bg-slate-500/10",
    icon: <FileCodeIcon className="h-3 w-3" />,
  },
}

export const StepNode: React.FC<StepNodeProps> = ({ data }) => {
  const { step, isSelected, stepNumber, totalSteps, direction } = data
  const config = STEP_TYPE_CONFIG[step.type] || STEP_TYPE_CONFIG.UNKNOWN
  const fileName = step.file.split("/").pop() || step.file

  const targetPos = direction === "TB" ? Position.Top : Position.Left
  const sourcePos = direction === "TB" ? Position.Bottom : Position.Right

  return (
    <div
      className={`relative w-72 rounded-2xl border transition-all duration-200 p-3.5 bg-surface shadow-card cursor-pointer select-none ${
        isSelected
          ? "border-brand ring-2 ring-brand/30 shadow-lg scale-[1.02]"
          : "border-line hover:border-brand-border/60 hover:shadow-subtle"
      }`}
    >
      {/* Handles */}
      <Handle
        type="target"
        position={targetPos}
        className="!w-2 !h-2 !bg-brand !border-white dark:!border-slate-900"
      />
      <Handle
        type="source"
        position={sourcePos}
        className="!w-2 !h-2 !bg-brand !border-white dark:!border-slate-900"
      />

      {/* Header: Step Number & Type Badge */}
      <div className="flex items-center justify-between gap-1.5 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-surface text-brand font-mono text-[10px] font-bold border border-brand-border/40">
            {stepNumber}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${config.bg} ${config.border} ${config.color}`}
          >
            {config.icon}
            <span>{config.label}</span>
          </span>
        </div>

        {/* Fact vs Inferred indicator */}
        <span
          className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold uppercase ${
            step.confidence === "HIGH" && !step.is_inferred
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
          }`}
        >
          {step.confidence === "HIGH" && !step.is_inferred ? "FACT" : "INFERRED"}
        </span>
      </div>

      {/* Primary Label */}
      <div className="space-y-1">
        <div className="font-semibold text-sm text-ink truncate leading-tight" title={step.label}>
          {step.label}
        </div>
        <div className="flex items-center gap-1 text-[11px] font-mono text-ink-tertiary truncate" title={step.file}>
          <FileCodeIcon className="h-3 w-3 text-ink-tertiary shrink-0" />
          <span className="truncate">{fileName}</span>
          {step.line && <span className="text-brand">:L{step.line}</span>}
        </div>
      </div>
    </div>
  )
}
