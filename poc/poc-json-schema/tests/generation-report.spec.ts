import { describe, expect, it } from 'vitest'
import { generationWarning, parseGenerationReport, type GenerationReport } from '../src/services/generation-report.js'

const report: GenerationReport = {
  mode: 'allow-incomplete', complete: false,
  blockedSections: [{
    theme: 'Synthetic', themeConceptId: 'urn:theme', sectionConceptId: 'urn:section', sectionLabel: 'Blocked',
    issues: [{ code: 'missing-datatype', conceptId: 'urn:field', message: 'Missing type.' }],
  }],
}

describe('Explicit snapshot coverage contract', () => {
  it('accepts legacy indexes and complete strict or explicitly incomplete selections', () => {
    expect(parseGenerationReport(undefined)).toBeUndefined()
    expect(parseGenerationReport(report)).toEqual(report)
    expect(generationWarning(report)).toContain('INCOMPLETE schema snapshot: 1 blocked section(s): Synthetic / Blocked')
    for (const mode of ['strict', 'allow-incomplete']) {
      const complete = { mode, complete: true, blockedSections: [], theme: 'Synthetic', sectionConceptId: 'urn:section' }
      expect(parseGenerationReport(complete)).toEqual(complete)
      expect(generationWarning(parseGenerationReport(complete))).toBeUndefined()
    }
  })

  it.each([
    null,
    {},
    { ...report, mode: 'ignore-errors' },
    { ...report, mode: 'strict' },
    { ...report, complete: true },
    { ...report, blockedSections: [] },
    { ...report, complete: 'false' },
    { ...report, sectionConceptId: 'urn:section' },
    { ...report, theme: '' },
    { ...report, blockedSections: [{ ...report.blockedSections[0], issues: [] }] },
    { ...report, blockedSections: [{ ...report.blockedSections[0], issues: [{ code: 'unknown', conceptId: 'urn:field', message: 'No.' }] }] },
    { ...report, blockedSections: [{ ...report.blockedSections[0], sectionConceptId: '' }] },
  ])('rejects malformed or contradictory generation metadata: %j', value => {
    expect(() => parseGenerationReport(value)).toThrow('Invalid schema generation report')
  })
})
