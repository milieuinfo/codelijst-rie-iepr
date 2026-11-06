export interface PublishedLabel {
  label: string
  symbol?: string
}
export const publishedLabelsPath: string
export function loadPublishedLabels(root: string): {
  available: boolean
  concepts: Record<string, PublishedLabel>
  source: string
}
