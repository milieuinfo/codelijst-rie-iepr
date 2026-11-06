export interface ReportingEntry {
  file: string
  schemeId: string
  slug: string
  label: string
}

export const reportingEntriesPath: string
export function loadReportingEntries(root: string, options?: { required?: boolean }): ReportingEntry[]
