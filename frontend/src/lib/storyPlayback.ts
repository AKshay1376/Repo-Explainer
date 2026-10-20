export const nextStoryIndex = (index: number, count: number) => Math.min(Math.max(0, count - 1), index + 1)
export const previousStoryIndex = (index: number) => Math.max(0, index - 1)
export const storyProgress = (index: number, count: number) => count ? `Step ${index + 1} of ${count}` : "No story steps"
