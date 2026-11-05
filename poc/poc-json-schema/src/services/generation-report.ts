export interface SourceMetadataIssue {
  code: 'unresolved-unit' | 'unresolved-code-list' | 'missing-datatype' | 'unsupported-datatype' | 'invalid-source-reference' | 'missing-relation' | 'inconsistent-table' | 'invalid-observation-context'
  conceptId: string
  message: string
}

export class SourceMetadataError extends Error {
  constructor(readonly issues: SourceMetadataIssue[]) {
    super(issues.map(issue => issue.message).join('\n'))
    this.name = 'SourceMetadataError'
  }
}

export interface BlockedSection {
  theme: string
  themeConceptId: string
  sectionConceptId: string
  sectionLabel: string
  issues: SourceMetadataIssue[]
}

export interface GenerationReport {
  mode: 'strict' | 'allow-incomplete'
  complete: boolean
  theme?: string
  sectionConceptId?: string
  blockedSections: BlockedSection[]
}

const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0

function isIssue(value: unknown): value is SourceMetadataIssue {
  return !!value && typeof value === 'object' &&
    'code' in value && typeof value.code === 'string' &&
    ['unresolved-unit', 'unresolved-code-list', 'missing-datatype', 'unsupported-datatype',
      'invalid-source-reference', 'missing-relation', 'inconsistent-table', 'invalid-observation-context'].includes(value.code) &&
    'conceptId' in value && text(value.conceptId) && 'message' in value && text(value.message)
}

function isBlockedSection(value: unknown): value is BlockedSection {
  return !!value && typeof value === 'object' &&
    'theme' in value && text(value.theme) &&
    'themeConceptId' in value && text(value.themeConceptId) &&
    'sectionConceptId' in value && text(value.sectionConceptId) &&
    'sectionLabel' in value && text(value.sectionLabel) &&
    'issues' in value && Array.isArray(value.issues) && value.issues.length > 0 && value.issues.every(isIssue)
}

function isReport(value: unknown): value is GenerationReport {
  return !!value && typeof value === 'object' &&
    'mode' in value && (value.mode === 'strict' || value.mode === 'allow-incomplete') &&
    'complete' in value && typeof value.complete === 'boolean' &&
    (!('theme' in value) || text(value.theme)) &&
    (!('sectionConceptId' in value) || (text(value.sectionConceptId) && 'theme' in value)) &&
    'blockedSections' in value && Array.isArray(value.blockedSections) && value.blockedSections.every(isBlockedSection) &&
    value.complete === (value.blockedSections.length === 0) &&
    (value.mode !== 'strict' || value.complete)
}

export function parseGenerationReport(value: unknown): GenerationReport | undefined {
  if (value === undefined) return undefined
  if (!isReport(value)) throw new Error('Invalid schema generation report: completeness and blocked-section diagnostics must agree.')
  return value
}

export function generationWarning(report: GenerationReport | undefined): string | undefined {
  if (!report || report.complete) return undefined
  return `INCOMPLETE schema snapshot: ${report.blockedSections.length} blocked section(s): ` +
    report.blockedSections.map(section => `${section.theme} / ${section.sectionLabel}`).join('; ') +
    '. See schema/index.json generation.blockedSections for source diagnostics.'
}
