import type { SourceFile } from "../types/source"

export const canCreatePatchFromSource = (file: SourceFile | null): boolean => Boolean(
  file && !file.is_sensitive && !file.is_binary && !file.redacted && file.content !== null
)
