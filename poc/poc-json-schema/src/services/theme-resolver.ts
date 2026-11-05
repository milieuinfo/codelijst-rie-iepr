import type { Concept, CodelistResult, Scheme } from '../models/index.js'
import { config } from '../config.js'

export interface StepTransition {
  fromSchemeId: string
  triggerConceptId: string
  toSchemeId: string
}

export interface ThemeChain {
  themeConcept: Concept
  schemeIds: string[]
  structuralChains: Map<string, string>
  /** Retained for the existing assembler; all branch leaves are in leafSchemeIds. */
  leafSchemeId: string
  leafSchemeIds?: string[]
  transitions?: StepTransition[]
}

export class ThemeResolver {
  resolveAllThemes(result: CodelistResult): Map<string, ThemeChain> {
    if (result.reportingProfile === 'groundwater-csv-v1') {
      const id = 'conceptscheme:operationeel_grondwater'
      if (!result.schemes.has(id)) throw new Error(`Missing reporting entry scheme ${id}.`)
      return new Map([['Grondwater', {
        themeConcept: { id, prefLabel: 'Grondwater' }, schemeIds: [id],
        structuralChains: new Map(), leafSchemeId: id, leafSchemeIds: [id], transitions: [],
      }]])
    }
    const themes = new Map<string, ThemeChain>()
    for (const theme of this.getThemeConcepts(result)) {
      const chain = this.resolveTheme(result, theme.id)
      if (!chain) throw new Error(`Theme ${theme.id} has no vervolgstap; sync the current codelist before generating schemas.`)
      const name = theme.prefLabel || theme.id
      if (themes.has(name)) throw new Error(`Duplicate theme label "${name}"; themes must have unambiguous entry points.`)
      themes.set(name, chain)
    }
    return themes
  }

  resolveTheme(result: CodelistResult, themeConceptId: string): ThemeChain | undefined {
    const themeConcept = result.concepts.get(themeConceptId)
    if (!themeConcept?.vervolgstap?.length) return undefined

    const schemeIds: string[] = []
    const structuralChains = new Map<string, string>()
    const transitions: StepTransition[] = []
    const leaves = new Set<string>()
    const active: string[] = []
    const visited = new Set<string>()

    const visit = (schemeId: string): void => {
      if (active.includes(schemeId)) {
        throw new Error(`vervolgstap cycle: ${[...active, schemeId].join(' -> ')}`)
      }
      if (!result.schemes.has(schemeId)) throw new Error(`Unresolved vervolgstap ${schemeId} in ${themeConceptId}.`)
      if (visited.has(schemeId)) return
      visited.add(schemeId)
      active.push(schemeId)
      schemeIds.push(schemeId)
      let hasNext = false
      for (const concept of this.conceptsOf(result, schemeId)) {
        for (const target of concept.vervolgstap ?? []) {
          hasNext = true
          transitions.push({ fromSchemeId: schemeId, triggerConceptId: concept.id, toSchemeId: target })
          // The full edge list retains branching; this map serves legacy single-target consumers.
          if (!structuralChains.has(concept.id)) structuralChains.set(concept.id, target)
          visit(target)
        }
      }
      if (!hasNext) leaves.add(schemeId)
      active.pop()
    }

    for (const entry of themeConcept.vervolgstap) visit(entry)
    const leafSchemeIds = [...leaves]
    return { themeConcept, schemeIds, structuralChains, transitions, leafSchemeIds, leafSchemeId: leafSchemeIds[0] }
  }

  getThemeConcepts(result: CodelistResult): Concept[] {
    const scheme = this.findThemeTypeScheme(result)
    if (!scheme) throw new Error(`Theme entry scheme not found (${config.themeSchemeIds.join(', ')}).`)
    return this.conceptsOf(result, scheme.id).filter(concept => !concept.broaderPartitive?.length)
  }

  private conceptsOf(result: CodelistResult, schemeId: string): Concept[] {
    const concepts = new Map((result.topConcepts.get(schemeId) ?? []).map(concept => [concept.id, concept]))
    for (const concept of result.concepts.values()) {
      if (concept.inScheme === schemeId) concepts.set(concept.id, concept)
    }
    return [...concepts.values()].sort((a, b) => a.id.localeCompare(b.id))
  }

  private findThemeTypeScheme(result: CodelistResult): Scheme | undefined {
    const expand = result.expandCurie ?? ((id: string) => id)
    for (const id of config.themeSchemeIds) {
      const match = result.schemes.get(id) ?? [...result.schemes.values()].find(
        scheme => expand(scheme.id) === expand(id),
      )
      if (match) return match
    }
    return undefined
  }
}
