import type { CodelistResult, SchemaField } from '../models/index.js'
import type { ThemeChain } from './theme-resolver.js'
import { ConceptMapper } from './concept-mapper.js'

export interface ThemeFieldSet {
  fields: SchemaField[]
  contributions: Map<string, SchemaField[]>
}

export class ChainComposer {
  composeThemeFields(result: CodelistResult, chain: ThemeChain, mapper: ConceptMapper): ThemeFieldSet {
    const allFields: SchemaField[] = []
    const contributions = new Map<string, SchemaField[]>()

    for (const schemeId of chain.schemeIds) {
      const rootFields = this.getSchemeRootFields(result, schemeId, mapper)
      contributions.set(schemeId, rootFields)
      allFields.push(...rootFields)
    }

    // If multiple FoI fields exist in the chain, keep only the deepest one (innermost scheme wins)
    const foiFields = allFields.filter(f => f.isFeatureOfInterest === true)
    if (foiFields.length > 1) {
      let selectedFoi = foiFields[0]
      let deepestIndex = -1
      for (const foi of foiFields) {
        const concept = result.concepts.get(foi.conceptId)
        const schemeIdx = concept ? chain.schemeIds.indexOf(concept.inScheme || '') : -1
        if (schemeIdx > deepestIndex) {
          deepestIndex = schemeIdx
          selectedFoi = foi
        }
      }
      for (const foi of foiFields) {
        if (foi !== selectedFoi) {
          const idx = allFields.indexOf(foi)
          if (idx >= 0) allFields.splice(idx, 1)
        }
      }
    }

    return { fields: allFields, contributions }
  }

  getSchemeRootFields(result: CodelistResult, schemeId: string, mapper: ConceptMapper): SchemaField[] {
    const topConcepts = result.topConcepts.get(schemeId) || []
    const fields: SchemaField[] = []

    for (const concept of topConcepts) {
      const field = mapper.mapConcept(concept)
      if (field) {
        fields.push(field)
      }
    }

    return fields
  }
}
