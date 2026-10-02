export interface ValidatorCommand {
  id: string
  kind: string
  label: string
  command: string[]
  working_directory: string
  source: string
  confidence: string
  trusted: boolean
}
export interface ValidatorProfile {
  id: string
  repo_id: string
  detected_stack: string[]
  commands: ValidatorCommand[]
  trusted: boolean
  trust_scope: "untrusted" | "trusted_once" | "trusted_repo"
  warnings: string[]
}
export interface ValidatorResult {
  command_id: string
  command?: string[]
  timestamp: string
  duration_seconds: number
  exit_code: number | null
  state: "PASSED" | "FAILED" | "TIMEOUT"
  output_summary: string
  revision: string
  patch_id: string
  paths?: string[]
}

export const stageGraph = (profile: ValidatorProfile | null, results: ValidatorResult[]) => {
  const stage = (name: string, kinds: string[]) => {
    const commands = profile?.commands.filter((item) => kinds.includes(item.kind)) || []
    const latest = results.find((item) => commands.some((command) => command.id === item.command_id))
    return { name, state: latest?.state || (commands.length && commands.some((item) => item.trusted) ? "NOT_RUN" : "NOT_TRUSTED") }
  }
  return [{ name: "Patch", state: "PASSED" }, stage("Syntax", ["syntax"]),
    stage("Typecheck", ["typecheck"]), stage("Targeted Tests", ["unit"]),
    stage("Full Tests", ["test", "integration"]), stage("Build", ["build"])]
}
