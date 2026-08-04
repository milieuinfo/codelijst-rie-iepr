import type { Concept, CodelistResult, Scheme } from '../models/index.js'

export interface EnumResolution {
  resolved: boolean
  values: string[]
  labels?: Map<string, string>
  warning?: string
}

export class EnumGenerator {
  private readonly result: CodelistResult

  constructor(result: CodelistResult) {
    this.result = result
  }

  resolveEnums(concept: Concept): EnumResolution {
    if (!concept.relevantCodeList || concept.relevantCodeList.length === 0) {
      return { resolved: false, values: [] }
    }

    const allValues: string[] = []
    const labels = new Map<string, string>()

    for (const schemeRef of concept.relevantCodeList) {
      const resolution = this.resolveSchemeToConcepts(schemeRef)
      if (resolution.success) {
        for (const [id, label] of resolution.entries) {
          allValues.push(id)
          labels.set(id, label)
        }
      } else {
        console.warn(`[EnumGenerator] ${resolution.warning}`)
      }
    }

    if (allValues.length > 0) {
      return { resolved: true, values: allValues, labels }
    }

    // Check if we had any refs at all but none resolved
    const firstBadRef = concept.relevantCodeList.find(ref => !this.result.schemes.has(ref))
    if (firstBadRef) {
      let warning = ''
      if (firstBadRef.includes('TODO')) {
        warning = `Unresolved relevantCodeList ref "${firstBadRef}" — TODO placeholder`
      } else if (!firstBadRef.startsWith('http') && firstBadRef.startsWith('conceptscheme-alg:')) {
        warning = `Unresolvable external prefix in relevantCodeList: "${firstBadRef}"`
      } else if (firstBadRef.startsWith('https://vito.be')) {
        warning = `External domain in relevantCodeList: "${firstBadRef}"`
      } else if (!this.result.schemes.has(firstBadRef)) {
        warning = `relevantCodeList scheme not found locally: "${firstBadRef}"`
      }
      return { resolved: false, values: [], warning }
    }

    return { resolved: false, values: [] }
  }

  resolveSchemeToConcepts(schemeRef: string): { success: true; entries: Map<string, string> } | { success: false; warning: string } {
    // Check for TODO placeholders
    if (schemeRef.includes('TODO')) {
      return { success: false, warning: `Unresolved relevantCodeList ref "${schemeRef}" — TODO placeholder` }
    }

    // Check external domains
    if (schemeRef.startsWith('https://vito.be') || schemeRef.startsWith('conceptscheme-alg:')) {
      return { success: false, warning: `External/unresolvable relevantCodeList ref: "${schemeRef}"` }
    }

    const scheme = this.result.schemes.get(schemeRef)
    if (!scheme) {
      return { success: false, warning: `relevantCodeList scheme not found in local index: "${schemeRef}"` }
    }

    const topConcepts = this.result.topConcepts.get(scheme.id) || []
    const entries = new Map<string, string>()
    for (const tc of topConcepts) {
      entries.set(tc.id, tc.prefLabel || tc.id)
    }

    if (entries.size === 0) {
      return { success: false, warning: `Scheme "${schemeRef}" has no top concepts` }
    }

    return { success: true, entries }
  }
}
