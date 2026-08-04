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

    return { fields: allFields, contributions }
  }

  getSchemeRootFields(result: CodelistResult, schemeId: string, mapper: ConceptMapper): SchemaField[] {
    const topConcepts = result.topConcepts.get(schemeId) || []
    const fields: SchemaField[] = []

    for (const concept of topConcepts) {
      // Only include concepts without a broader reference as root fields
      if (concept.broader && concept.broader.length > 0) continue
      const field = mapper.mapConcept(concept)
      if (field) {
        fields.push(field)
      }
    }

    return fields
  }
}
