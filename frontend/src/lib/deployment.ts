export type DeploymentCapabilities = Record<string, boolean>

export function tabAvailable(tab: string, capabilities: DeploymentCapabilities = {}): boolean {
  if (tab === "history") return capabilities.local_filesystem !== false
  if (tab === "patch") return capabilities.patch_apply !== false
  if (tab === "validation") return capabilities.validator_execution !== false
  return true
}

export function jobLabel(status: string): string {
  return ({ queued: "Queued", running: "Running", completed: "Completed",
    failed: "Failed", cancelled: "Cancelled" } as Record<string, string>)[status] || "Unknown"
}
