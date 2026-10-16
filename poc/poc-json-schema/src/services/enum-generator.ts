import type { Concept, CodelistResult, Scheme } from '../models/index.js'
import { config } from '../config.js'

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
    const firstBadRef = concept.relevantCodeList.find(ref => !this.result.schemes.has(ref) && !this.result.collections.has(ref))
    if (firstBadRef) {
      let warning = ''
      if (isPlaceholder(firstBadRef)) {
        warning = `Unresolved relevantCodeList ref "${firstBadRef}" — placeholder`
      } else if (isExternalDomain(firstBadRef)) {
        warning = `External/unresolvable relevantCodeList ref: "${firstBadRef}"`
      } else if (!this.result.schemes.has(firstBadRef)) {
        warning = `relevantCodeList scheme not found locally: "${firstBadRef}"`
      }
      return { resolved: false, values: [], warning }
    }

    return { resolved: false, values: [] }
  }

  resolveSchemeToConcepts(schemeRef: string): { success: true; entries: Map<string, string> } | { success: false; warning: string } {
    if (isPlaceholder(schemeRef)) {
      return { success: false, warning: `Unresolved relevantCodeList ref "${schemeRef}" — placeholder` }
    }

    if (isExternalDomain(schemeRef)) {
      return { success: false, warning: `External/unresolvable relevantCodeList ref: "${schemeRef}"` }
    }

    // A skos:Collection selects concepts from one or more (possibly external) schemes, e.g. CSOR variabelen
    const members = this.result.collections.get(schemeRef)
    if (members) {
      const entries = new Map<string, string>()
      for (const member of members) {
        const expandedId = this.result.expandCurie ? this.result.expandCurie(member) : member
        entries.set(expandedId, this.result.concepts.get(member)?.prefLabel || expandedId)
      }
      if (entries.size === 0) {
        return { success: false, warning: `Collection "${schemeRef}" has no members` }
      }
      return { success: true, entries }
    }

    const scheme = this.result.schemes.get(schemeRef)
    if (!scheme) {
      return { success: false, warning: `relevantCodeList scheme not found in local index: "${schemeRef}"` }
    }

    const topConcepts = this.result.topConcepts.get(scheme.id) || []
    const entries = new Map<string, string>()
    for (const tc of topConcepts) {
      const expandedId = this.result.expandCurie ? this.result.expandCurie(tc.id) : tc.id
      entries.set(expandedId, tc.prefLabel || expandedId)
    }

    if (entries.size === 0) {
      return { success: false, warning: `Scheme "${schemeRef}" has no top concepts` }
    }

    return { success: true, entries }
  }
}

/** Whether the reference contains a known placeholder marker. */
function isPlaceholder(ref: string): boolean {
  return config.placeholderMarkers.some(marker => ref.includes(marker))
}

/** Whether the reference starts with a known external domain prefix. */
function isExternalDomain(ref: string): boolean {
  return config.externalDomainPrefixes.some(prefix => ref.startsWith(prefix))
}
