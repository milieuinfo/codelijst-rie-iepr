import type { CodelistResult, Concept, SchemaField } from '../models/index.js'
import type { ThemeChain } from './theme-resolver.js'
import { ConceptMapper } from './concept-mapper.js'
import { isObservationClass, isSourceReportingProfile } from '../config.js'
import { SourceMetadataError, type SourceMetadataIssue } from './generation-report.js'

export interface ThemeFieldSet {
  fields: SchemaField[]
  contributions: Map<string, SchemaField[]>
}

export class ChainComposer {
  getReportingSections(result: CodelistResult, chain: ThemeChain): Concept[] {
    const concepts = [...result.concepts.values()]
    return concepts.filter(concept => concept.inScheme && chain.schemeIds.includes(concept.inScheme) &&
      concept.isOnzichtbaar !== true && this.isReportingSection(concept, concepts))
  }

  private isReportingSection(concept: Concept, concepts: Concept[]): boolean {
    return !concept.broaderPartitive?.length && !concept.relevantRiepr?.length &&
      (isObservationClass(concept.relevantClass) || concepts.some(child => child.broaderPartitive?.includes(concept.id)))
  }

  composeThemeFields(result: CodelistResult, chain: ThemeChain, mapper: ConceptMapper, sectionId?: string): ThemeFieldSet {
    const allFields: SchemaField[] = []
    const contributions = new Map<string, SchemaField[]>()
    const issues: SourceMetadataIssue[] = []

    const selected = sectionId ? result.concepts.get(sectionId) ?? [...result.concepts.values()].find(concept =>
      result.expandCurie?.(concept.id) === sectionId) : undefined
    if (sectionId && (!selected?.inScheme || !chain.schemeIds.includes(selected.inScheme))) {
      throw new Error(`Section ${sectionId} is not reachable in this theme.`)
    }
    if (selected && !this.isReportingSection(selected, [...result.concepts.values()])) {
      throw new Error(`Section ${sectionId} must identify a top-level reporting record, not a nested field or a structural selector.`)
    }
    const included = selected ? new Set([selected.inScheme!]) : new Set(chain.schemeIds)
    if (selected) {
      let changed = true
      while (changed) {
        changed = false
        for (const edge of chain.transitions ?? []) {
          if (included.has(edge.toSchemeId) && !included.has(edge.fromSchemeId)) {
            included.add(edge.fromSchemeId)
            changed = true
          }
        }
      }
    }
    for (const schemeId of chain.schemeIds.filter(id => included.has(id))) {
      const concepts = [...result.concepts.values()].filter(concept => concept.inScheme === schemeId)
      const filtered = concepts.filter(concept => {
        let root = concept
        const visited = new Set<string>()
        while (root.broaderPartitive?.length) {
          if (root.broaderPartitive.length > 1) throw new Error(`Ambiguous ownership of ${root.id}.`)
          if (visited.has(root.id)) throw new Error(`Ownership cycle at ${root.id}.`)
          visited.add(root.id)
          const parent = result.concepts.get(root.broaderPartitive[0])
          if (!parent) throw new Error(`Missing parent of ${root.id}.`)
          root = parent
        }
        if (!selected || schemeId !== selected.inScheme) return true
        return root.id === selected.id || (!isObservationClass(root.relevantClass) &&
          !concepts.some(child => child.broaderPartitive?.includes(root.id)))
      })
      const rootFields = filtered.flatMap(concept => {
        if (isSourceReportingProfile(result.reportingProfile)) {
          for (const [column, refs] of Object.entries({
            conditionPath: concept.conditionPath ? [concept.conditionPath] : [],
            variabele: concept.variabele ? [concept.variabele] : [],
            _ui_after: concept.uiAfter ? [concept.uiAfter] : [],
            relevantObservation: concept.relevantObservation ?? [],
          })) for (const ref of refs) {
            if (!result.concepts.has(ref)) issues.push({
              code: 'invalid-source-reference', conceptId: concept.id,
              message: `${concept.id}: ${column} refers to missing concept ${ref}.`,
            })
          }
          if (concept.relevantObservation?.some(id => id !== concept.broaderPartitive?.[0]) &&
              concept.relevantDataType && !concept.relation &&
              concept.broaderPartitive?.some(id => isObservationClass(result.concepts.get(id)?.relevantClass))) {
            issues.push({
              code: 'missing-relation', conceptId: concept.id,
              message: `${concept.id}: declare the relation for data assigned to another observation (e.g. sosa:resultTime).`,
            })
          }
        }
        try {
          const field = mapper.mapConcept(concept)
          return field ? [field] : []
        } catch (error) {
          if (!(error instanceof SourceMetadataError)) throw error
          issues.push(...error.issues)
          return []
        }
      })
      contributions.set(schemeId, rootFields)
      allFields.push(...rootFields)
    }

    if (issues.length) throw new SourceMetadataError(issues)
    return { fields: allFields, contributions }
  }

  getSchemeRootFields(result: CodelistResult, schemeId: string, mapper: ConceptMapper): SchemaField[] {
    // hasTopConcept lists only the top-level concepts; their composite children are
    // in the same scheme (inScheme) and get nested later via broaderPartitive.
    const concepts = new Set(result.topConcepts.get(schemeId) || [])
    for (const concept of result.concepts.values()) {
      if (concept.inScheme === schemeId) concepts.add(concept)
    }
    const fields: SchemaField[] = []

    for (const concept of concepts) {
      const field = mapper.mapConcept(concept)
      if (field) {
        fields.push(field)
      }
    }

    return fields
  }
}
