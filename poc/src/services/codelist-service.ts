import type { Concept, Scheme } from '../models/skos-models.js'

/**
 * Raw JSON-LD node as it appears in the rie-iepr.jsonld graph. The file mixes
 * `@id`/`@type` (JSON-LD keywords) and `id`/`_type` (compacted aliases used by
 * this particular export) for the same thing, and the same node can appear
 * both flattened at the top level of `graph` and re-embedded inline wherever
 * something else references it (e.g. a thema's `relevantRiepr` embeds the
 * full operationeel conceptscheme, which embeds its top concepts, which embed
 * their narrower children...). Any field can therefore hold either a bare id
 * string or a fully inlined node.
 */
export type JsonLdNode = Record<string, unknown>

export interface CodelistOptions {
  normalizeBooleans?: boolean
}

export interface CodelistResult {
  /** Every node in the document, keyed by id, merged across every place it was found. */
  nodesById: Map<string, JsonLdNode>
  schemes: Map<string, Scheme>
  concepts: Map<string, Concept>
  topConcepts: Map<string, Concept[]>
}

const SCHEME_TYPES = ['skos:ConceptScheme']
const CONCEPT_TYPES = ['skos:Concept']

/**
 * Reads and queries the RIE-IEPR SKOS codelists (rie-iepr.jsonld).
 *
 * The parsing strategy is deliberately generic and content-agnostic: it does
 * not special-case any particular conceptscheme or property. It builds a
 * single id -> node index by recursively flattening the entire document
 * (top-level `graph` plus every inline/nested node reachable from it), then
 * exposes typed views (schemes/concepts) and reference-resolution helpers on
 * top of that index. New conceptschemes or properties added to the source
 * data need no code changes here.
 */
export class CodelistService {
  private readonly baseUrl: string = '/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/'
  private readonly fileName: string = 'rie-iepr.jsonld'

  async loadCodelist(options: CodelistOptions = {}): Promise<CodelistResult> {
    const normalizeBooleans = options.normalizeBooleans ?? true

    const response = await fetch(this.baseUrl + this.fileName)

    if (!response.ok) {
      throw new Error(`Failed to fetch codelist: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as Record<string, unknown>

    return this.parseData(data, normalizeBooleans)
  }

  private parseData(data: Record<string, unknown>, normalizeBooleans: boolean): CodelistResult {
    const graph = Array.isArray(data['graph']) ? data['graph'] : data['graph'] ? [data['graph']] : []

    const nodesById = this.buildNodeIndex(graph)

    const schemes = new Map<string, Scheme>()
    const concepts = new Map<string, Concept>()

    for (const [id, node] of nodesById.entries()) {
      const types = this.getTypes(node)

      if (types.some(t => SCHEME_TYPES.includes(t))) {
        schemes.set(id, this.toScheme(node))
      }

      // A node can be both a skos:Concept and something else (e.g. qudt:Unit);
      // schemes and concepts are not mutually exclusive checks.
      if (types.some(t => CONCEPT_TYPES.includes(t))) {
        concepts.set(id, this.toConcept(node, normalizeBooleans))
      }
    }

    const topConcepts = new Map<string, Concept[]>()

    for (const [schemeId, node] of nodesById.entries()) {
      const hasTopConcept = node['hasTopConcept'] ?? node['has_top_concept']

      if (!hasTopConcept) continue

      const refs = Array.isArray(hasTopConcept) ? hasTopConcept : [hasTopConcept]
      const resolved: Concept[] = []

      for (const ref of refs) {
        const refId = this.idOf(ref)
        const concept = refId ? concepts.get(refId) : undefined
        if (concept) resolved.push(concept)
      }

      topConcepts.set(schemeId, resolved)
    }

    return { nodesById, schemes, concepts, topConcepts }
  }

  /**
   * Recursively walks every object/array in the graph and indexes every node
   * that has an id, merging duplicate sightings of the same id (a node seen
   * fully inline somewhere is more complete than a bare-string reference
   * elsewhere, so later/fuller sightings fill in missing properties rather
   * than replacing what's already known).
   * @param root - The top-level graph array or single node to walk.
   * @returns A map from each node's id string to its merged property set.
   */
  private buildNodeIndex(root: unknown): Map<string, JsonLdNode> {
    const nodesById = new Map<string, JsonLdNode>()
    const seen = new Set<unknown>()

    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) visit(item)
        return
      }

      if (!value || typeof value !== 'object' || seen.has(value)) return
      seen.add(value)

      const node = value as JsonLdNode
      const id = this.idOf(node)

      if (id) {
        const existing = nodesById.get(id)
        if (existing) {
          for (const [key, val] of Object.entries(node)) {
            if (existing[key] === undefined) existing[key] = val
          }
        } else {
          nodesById.set(id, { ...node })
        }
      }

      for (const val of Object.values(node)) visit(val)
    }

    visit(root)
    return nodesById
  }

  private idOf(value: unknown): string | undefined {
    if (typeof value === 'string') return value
    if (value && typeof value === 'object') {
      const id = (value as JsonLdNode)['@id'] ?? (value as JsonLdNode)['id']
      return typeof id === 'string' ? id : undefined
    }
    return undefined
  }

  private getTypes(node: JsonLdNode): string[] {
    const raw = node['@type'] ?? node['_type']
    if (!raw) return []
    return Array.isArray(raw) ? raw.filter((t): t is string => typeof t === 'string') : [String(raw)]
  }

  private toScheme(node: JsonLdNode): Scheme {
    return {
      id: String(this.idOf(node)),
      type: this.getTypes(node),
      prefLabel: this.getValue(node, ['prefLabel', 'has_pref_label']) as string | undefined,
      definition: this.getValue(node, ['definition', 'has_definition']) as string | undefined,
      note: this.getValue(node, ['note', 'has_note']) as string | undefined,
      relevantRiepr: this.idsOf(this.getValue(node, ['relevantRiepr', 'relevant_riepr'])),
    }
  }

  private toConcept(node: JsonLdNode, normalizeBooleans: boolean): Concept {
    const concept: Concept = {
      id: String(this.idOf(node)),
      type: this.getTypes(node),
      inScheme: this.idOf(this.getValue(node, ['inScheme', 'in_scheme'])),
      code: this.getValue(node, ['code', 'notation']) as string | undefined,
      prefLabel: this.getValue(node, ['prefLabel', 'has_pref_label']) as string | undefined,
      altLabel: this.getValue(node, ['altLabel', 'alt_label']) as string[] | undefined,
      definition: this.getValue(node, ['definition', 'has_definition']) as string | undefined,
      note: this.getValue(node, ['note', 'has_note']) as string | undefined,
      broader: this.idsOf(this.getValue(node, ['broader'])),
      narrower: this.idsOf(this.getValue(node, ['narrower'])),
      topConceptOf: this.idOf(this.getValue(node, ['topConceptOf', 'top_concept_of'])),
      broaderTransitive: this.idsOf(this.getValue(node, ['broaderTransitive', 'broader_transitive'])),
      narrowerTransitive: this.idsOf(this.getValue(node, ['narrowerTransitive', 'narrower_transitive'])),
      semanticRelation: this.idsOf(this.getValue(node, ['semanticRelation', 'semantic_relation'])),
      relevantProperty: this.getValue(node, ['relevantProperty', 'relevant_property']) as string | undefined,
    }

    const relevantDataType = this.getValue(node, ['relevantDataType', 'relevant_data_type'])
    concept.relevantDataType = typeof relevantDataType === 'string' ? relevantDataType : undefined

    concept.conditionPath = this.idOf(this.getValue(node, ['conditionPath', 'condition_path']))
    concept.conditionValue = this.getValue(node, ['conditionValue', 'condition_value']) as string | undefined

    concept.relevantCodeList = this.idsOf(this.getValue(node, ['relevantCodeList', 'relevant_code_list']))
    concept.relevantRiepr = this.idsOf(this.getValue(node, ['relevantRiepr', 'relevant_riepr']))
    concept.relevantUnit = this.idsOf(this.getValue(node, ['relevantUnit', 'relevant_unit']))

    if (normalizeBooleans) {
      concept.isVerplicht = this.parseBoolean(this.getValue(node, ['isVerplicht', 'is_verplicht']))
      concept.isMeervoudig = this.parseBoolean(this.getValue(node, ['isMeervoudig', 'is_meervoudig']))
      concept.isMeetbaar = this.parseBoolean(this.getValue(node, ['isMeetbaar', 'is_meetbaar']))
      concept.isOnzichtbaar = this.parseBoolean(this.getValue(node, ['isOnzichtbaar', 'is_onzichtbaar']))
    } else {
      concept.isVerplicht = this.getValue(node, ['isVerplicht', 'is_verplicht']) as string | undefined
      concept.isMeervoudig = this.getValue(node, ['isMeervoudig', 'is_meervoudig']) as string | undefined
      concept.isMeetbaar = this.getValue(node, ['isMeetbaar', 'is_meetbaar']) as string | undefined
      concept.isOnzichtbaar = this.getValue(node, ['isOnzichtbaar', 'is_onzichtbaar']) as string | undefined
    }

    return concept
  }

  /**
   * Normalizes a single ref or array-of-refs field down to an array of ids.
   * @param value - The raw reference value (string id, object with @id, or array thereof).
   * @returns Array of resolved id strings, or undefined if no valid refs found.
   */
  private idsOf(value: unknown): string[] | undefined {
    if (value === undefined || value === null) return undefined
    const arr = Array.isArray(value) ? value : [value]
    const ids = arr.map(v => this.idOf(v)).filter((v): v is string => v !== undefined)
    return ids.length > 0 ? ids : undefined
  }

  private parseBoolean(value: unknown): boolean | undefined {
    if (value === undefined || value === null) return undefined
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim()
      if (lower === 'true' || lower === '1') return true
      if (lower === 'false' || lower === '0') return false
    }
    return undefined
  }

  private getValue(obj: Record<string, unknown>, keys: string[]): unknown {
    for (const key of keys) {
      if (obj[key] !== undefined) return obj[key]
    }
    return undefined
  }

  getSchemes(result: CodelistResult): Scheme[] {
    return Array.from(result.schemes.values())
  }

  getScheme(result: CodelistResult, id: string): Scheme | undefined {
    return result.schemes.get(id)
  }

  getConcept(result: CodelistResult, id: string): Concept | undefined {
    return result.concepts.get(id)
  }

  getConceptsForScheme(result: CodelistResult, schemeId: string): Concept[] {
    const concepts: Concept[] = []
    for (const concept of result.concepts.values()) {
      if (concept.inScheme === schemeId) concepts.push(concept)
    }
    return concepts
  }

  getTopConceptsForScheme(result: CodelistResult, schemeId: string): Concept[] {
    return result.topConcepts.get(schemeId) || []
  }

  getChildren(result: CodelistResult, concept: Concept): Concept[] {
    if (!concept.narrower) return []
    return concept.narrower
      .map(id => result.concepts.get(id))
      .filter((c): c is Concept => c !== undefined)
  }

  getParent(result: CodelistResult, concept: Concept): Concept | null {
    const parentId = concept.broader?.[0]
    if (!parentId) return null
    return result.concepts.get(parentId) ?? null
  }

  /**
   * Resolves the conceptschemes referenced by a field's `relevantCodeList`.
   * Refs pointing outside this document (a different prefix, an external
   * URL, or a literal "TODO" placeholder) resolve to nothing rather than
   * throwing, per the POC's "silently ignore, still show a selection" rule.
   * @param result - The parsed codelist result containing schemes and concepts.
   * @param concept - The concept whose relevantCodeList refs to resolve.
   * @returns Array of resolved scheme objects for each valid ref.
   */
  getCodeListSchemes(result: CodelistResult, concept: Concept): Scheme[] {
    if (!concept.relevantCodeList) return []
    return concept.relevantCodeList
      .map(id => result.schemes.get(id))
      .filter((s): s is Scheme => s !== undefined)
  }

  /**
   * Resolves a `relevantRiepr` ref list (on a scheme or a concept) to whatever node they point to.
   * @param result - The parsed codelist result containing schemes and concepts for lookup.
   * @param node - The scheme or concept whose relevantRiepr refs to resolve.
   * @returns Array of resolved scheme/concept objects for each valid ref.
   */
  getRelevantRieprRefs(result: CodelistResult, node: Scheme | Concept): (Scheme | Concept)[] {
    if (!node.relevantRiepr) return []
    return node.relevantRiepr
      .map(id => result.schemes.get(id) ?? result.concepts.get(id))
      .filter((n): n is Scheme | Concept => n !== undefined)
  }
}
