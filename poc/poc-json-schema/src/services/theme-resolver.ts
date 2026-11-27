import type { Concept, CodelistResult } from '../models/index.js'

export interface ThemeChain {
  themeConcept: Concept
  slug?: string
  schemeIds: string[]
  structuralChains: Map<string, string>
  leafSchemeId: string
  leafSchemeIds?: string[]
}

/**
 * Resolves the active reporting sections from the explicit reporting profile.
 * Operational CSVs are reporting entry points; they are not reached through
 * navigation metadata in the published codelist.
 */
export class ThemeResolver {
  resolveAllThemes(result: CodelistResult): Map<string, ThemeChain> {
    if (result.reportingProfile === 'groundwater-csv-v1') {
      const id = 'conceptscheme:operationeel_grondwater'
      if (!result.schemes.has(id)) throw new Error(`Missing reporting entry scheme ${id}.`)
      return new Map([['Grondwater', this.chain(id, 'Grondwater', 'grondwater')]])
    }

    if (result.reportingProfile !== 'operational-csv-v1' || !result.reportingEntries?.length) {
      throw new Error('Missing source reporting entries.')
    }

    const themes = new Map<string, ThemeChain>()
    const slugs = new Set<string>()
    for (const { schemeId, label, slug } of result.reportingEntries) {
      if (!result.schemes.has(schemeId)) throw new Error(`Missing reporting entry scheme ${schemeId}.`)
      if (themes.has(label) || slugs.has(slug)) throw new Error(`Duplicate reporting entry ${label} (${slug}).`)
      themes.set(label, this.chain(schemeId, label, slug))
      slugs.add(slug)
    }
    return themes
  }

  private chain(schemeId: string, label: string, slug?: string): ThemeChain {
    return {
      themeConcept: { id: schemeId, prefLabel: label },
      ...(slug ? { slug } : {}),
      schemeIds: [schemeId],
      structuralChains: new Map(),
      leafSchemeId: schemeId,
      leafSchemeIds: [schemeId],
    }
  }
}
