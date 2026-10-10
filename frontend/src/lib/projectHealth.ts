import type { HealthCategory, HealthFinding, HealthLevel } from "../types/projectHealth"

export interface HealthFilters {
  category: HealthCategory | "All"
  severity: HealthLevel | "All"
  confidence: HealthLevel | "All"
  path: string
  actionableOnly?: boolean
}

export function filterHealthFindings(findings: HealthFinding[], filters: HealthFilters): HealthFinding[] {
  const path = filters.path.trim().toLowerCase()
  return findings.filter(finding =>
    (filters.category === "All" || finding.category === filters.category) &&
    (filters.severity === "All" || finding.severity === filters.severity) &&
    (filters.confidence === "All" || finding.confidence === filters.confidence) &&
    (!path || (finding.file || "").toLowerCase().includes(path)) &&
    (!filters.actionableOnly || finding.suggested_actions.length > 0)
  )
}
