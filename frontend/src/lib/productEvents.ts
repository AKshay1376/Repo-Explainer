export type ProductEvent = "view_opened" | "analysis_started" | "analysis_completed" | "patch_previewed" | "patch_applied"

/** Reserved event boundary. No storage or network transport is enabled. */
export function emitProductEvent(_event: ProductEvent, _details: Record<string, string> = {}): void {
  // Intentionally local and inert until a future explicit opt-in implementation exists.
}
