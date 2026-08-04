import type { Concept, CodelistResult, Scheme } from '../models/index.js'

export interface ThemeChain {
  themeConcept: Concept
  schemeIds: string[]
  structuralChains: Map<string, string>
}

export class ThemeResolver {
  resolveAllThemes(result: CodelistResult): Map<string, ThemeChain> {
    const themaScheme = this.findThemaTypeScheme(result)
    if (!themaScheme) {
      console.warn('[ThemeResolver] Could not find thema_type scheme')
      return new Map()
    }

    const topConcepts = result.topConcepts.get(themaScheme.id) || []
    const themes = new Map<string, ThemeChain>()

    for (const themeConcept of topConcepts) {
      const chain = this.resolveTheme(result, themeConcept.id)
      if (chain) {
        const label = themeConcept.prefLabel || this.slugify(themeConcept.id)
        themes.set(label, chain)
      }
    }

    return themes
  }

  resolveTheme(result: CodelistResult, themeConceptId: string): ThemeChain | undefined {
    const themeConcept = result.concepts.get(themeConceptId)
    if (!themeConcept) return undefined

    // Find base operationeel scheme via seeAlso
    let currentSchemeId: string | undefined
    for (const ref of themeConcept.seeAlso || []) {
      const scheme = result.schemes.get(ref)
      if (scheme && scheme.type?.includes('skos:ConceptScheme')) {
        currentSchemeId = ref
        break
      }
    }

    if (!currentSchemeId) return undefined

    const schemeIds = [currentSchemeId]
    const structuralChains = new Map<string, string>()

    // Discover and follow seeAlso chains recursively
    let discovered = true
    while (discovered) {
      discovered = false
      for (const schemeId of [...schemeIds]) {
        const scheme = result.schemes.get(schemeId)
        if (!scheme) continue

        // Check top concepts in this scheme for seeAlso refs to other local schemes
        const topConcepts = result.topConcepts.get(schemeId) || []
        for (const concept of topConcepts) {
          for (const ref of concept.seeAlso || []) {
            const targetScheme = result.schemes.get(ref)
            if (targetScheme && !schemeIds.includes(ref)) {
              schemeIds.push(ref)
              structuralChains.set(concept.id, ref)
              discovered = true
            }
          }
        }

        // Also check ALL concepts within the discovered scheme for seeAlso refs
        for (const c of result.concepts.values()) {
          if (c.inScheme === schemeId) {
            for (const ref of c.seeAlso || []) {
              const targetScheme = result.schemes.get(ref)
              if (targetScheme && !schemeIds.includes(ref)) {
                schemeIds.push(ref)
                structuralChains.set(c.id, ref)
                discovered = true
              }
            }
          }
        }
      }
    }

    // Second pass: scan all concepts for additional seeAlso links that bridge disconnected schemes
    // Only consider concepts whose IDs share a meaningful prefix with our discovered schemes
    let extraDiscovered = true
    while (extraDiscovered) {
      extraDiscovered = false
      for (const [conceptId, concept] of result.concepts.entries()) {
        for (const ref of concept.seeAlso || []) {
          const targetScheme = result.schemes.get(ref)
          if (targetScheme && !schemeIds.includes(ref)) {
            // Normalize both IDs by replacing hyphens with underscores for comparison
            const normalizedConceptId = conceptId.replace(/-/g, '_')
            const isRelated = schemeIds.some(existingScheme => {
              const normalizedScheme = existingScheme.replace(/-/g, '_')
              return normalizedScheme.includes(normalizedConceptId.split(':')[0]) ||
                     normalizedConceptId.includes(normalizedScheme.split(':').pop() || '')
            })
            
            if (isRelated) {
              schemeIds.push(ref)
              structuralChains.set(conceptId, ref)
              extraDiscovered = true
            }
          }
        }
      }
    }

    return { themeConcept, schemeIds, structuralChains }
  }

  getThemeConcepts(result: CodelistResult): Concept[] {
    const themaScheme = this.findThemaTypeScheme(result)
    if (!themaScheme) return []
    return result.topConcepts.get(themaScheme.id) || []
  }

  private findThemaTypeScheme(result: CodelistResult): Scheme | undefined {
    for (const [, scheme] of result.schemes.entries()) {
      if (scheme.id === 'conceptscheme:thema_type') {
        return scheme
      }
    }
    // Fallback: look for any scheme with "thema" in the id
    for (const [id, scheme] of result.schemes.entries()) {
      if (id.toLowerCase().includes('thema')) {
        return scheme
      }
    }
    return undefined
  }

  private slugify(text: string): string {
    return text.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
  }
}
