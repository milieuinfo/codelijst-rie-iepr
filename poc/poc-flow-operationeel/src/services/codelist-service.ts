import type { Concept, Scheme } from '../models/skos-models.js'

/**
 * Raw JSON-LD node as it appears in the rie-iepr.jsonld graph. The file mixes
 * `@id`/`@type` (JSON-LD keywords) and `id`/`_type` (compacted aliases used by
 * this particular export) for the same thing, and the same node can appear
 * both flattened at the top level of `graph` and re-embedded inline wherever
 * something else references it (e.g. a thema's `seeAlso` embeds the
 * full operationeel conceptscheme, which embeds its top concepts, which embed
 * their hasPart children...). Any field can therefore hold either a bare id
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
 *
 * **seeAlso-based navigation:** The updated codelist format uses `seeAlso`
 * instead of `relevantRiepr` for theme→scheme navigation and for chaining
 * multi-step flows within operational schemes. Use `getSeeAlsoRefs()` to
 * resolve these links.
 */
export class CodelistService {
  private readonly resourcePath: string = 'resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/'
  private readonly fileName: string = 'rie-iepr.jsonld'

  /** Resolves the app base from the page URL (e.g. "/" locally, "/codelijst-rie-iepr/" on GitHub Pages). */
  private getAppBase(): string {
    const p = window.location.pathname
    const idx = p.lastIndexOf('/')
    return p.substring(0, idx + 1) || '/'
  }

  async loadCodelist(options: CodelistOptions = {}): Promise<CodelistResult> {
    const normalizeBooleans = options.normalizeBooleans ?? true

    const url = this.getAppBase() + this.resourcePath + this.fileName
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Failed to fetch codelist: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as Record<string, unknown>

    return this.parseData(data, normalizeBooleans)
  }

  protected parseData(data: Record<string, unknown>, normalizeBooleans: boolean): CodelistResult {
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
      seeAlso: this.idsOf(this.getValue(node, ['seeAlso', 'see_also'])),
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
       isPartOf: this.idsOf(this.getValue(node, ['isPartOf'])),
       hasPart: this.idsOf(this.getValue(node, ['hasPart'])),
       topConceptOf: this.idOf(this.getValue(node, ['topConceptOf', 'top_concept_of'])),
       semanticRelation: this.idsOf(this.getValue(node, ['semanticRelation', 'semantic_relation'])),
      relevantProperty: this.getValue(node, ['relevantProperty', 'relevant_property']) as string | undefined,
    }

    const relevantDataType = this.getValue(node, ['relevantDataType', 'relevant_data_type'])
    concept.relevantDataType = typeof relevantDataType === 'string' ? relevantDataType : undefined

    // conditionPath / conditionValue may be arrays ("@container": "@set") containing
    // either bare-string IDs or embedded concept nodes; use idsOf() to flatten to
    // plain ID strings regardless of whether they were flattened or inlined.
    const cpIds = this.idsOf(this.getValue(node, ['conditionPath', 'condition_path'])) ?? []
    concept.conditionPath = cpIds.length > 0 ? cpIds[0] : undefined

    const cvIds = this.idsOf(this.getValue(node, ['conditionValue', 'condition_value'])) ?? []
    concept.conditionValue = cvIds.length > 0 ? this.normalizeConditionValue(cvIds[0]) : undefined
    if (cvIds.length > 0) {
      concept.conditionValues = cvIds.map(v => this.normalizeConditionValue(v))
    }

    concept.related = this.idsOf(this.getValue(node, ['related']))

    concept.relevantCodeList = this.idsOf(this.getValue(node, ['relevantCodeList', 'relevant_code_list']))
    concept.relevantRiepr = this.idsOf(this.getValue(node, ['relevantRiepr', 'relevant_riepr']))
    concept.relevantUnit = this.idsOf(this.getValue(node, ['relevantUnit', 'relevant_unit']))

    // New properties from updated codelist format (seeAlso navigation model)
    concept.seeAlso = this.idsOf(this.getValue(node, ['seeAlso', 'see_also']))
    concept.relevantClass = typeof this.getValue(node, ['relevantClass', 'relevant_class']) === 'string'
      ? String(this.getValue(node, ['relevantClass', 'relevant_class']))
      : undefined

    if (normalizeBooleans) {
      concept.isVerplicht = this.parseBoolean(this.getValue(node, ['isVerplicht', 'is_verplicht']))
      concept.isMeervoudig = this.parseBoolean(this.getValue(node, ['isMeervoudig', 'is_meervoudig']))
      concept.isMeetbaar = this.parseBoolean(this.getValue(node, ['isMeetbaar', 'is_meetbaar']))
      concept.isOnzichtbaar = this.parseBoolean(this.getValue(node, ['isOnzichtbaar', 'is_onzichtbaar']))
      concept.isMultiselect = this.parseBoolean(this.getValue(node, ['isMultiselect', 'is_multiselect']))
    // UI ordering annotations
    concept.uiAfter = this.idOf(this.getValue(node, ['_ui_after', 'ui_after']))
    concept.uiFirst = this.parseBoolean(this.getValue(node, ['_ui_first', 'ui_first']))
    } else {
      concept.isVerplicht = this.getValue(node, ['isVerplicht', 'is_verplicht']) as string | undefined
      concept.isMeervoudig = this.getValue(node, ['isMeervoudig', 'is_meervoudig']) as string | undefined
      concept.isMeetbaar = this.getValue(node, ['isMeetbaar', 'is_meetbaar']) as string | undefined
      concept.isOnzichtbaar = this.getValue(node, ['isOnzichtbaar', 'is_onzichtbaar']) as string | undefined
      concept.isMultiselect = this.getValue(node, ['isMultiselect', 'is_multiselect']) as string | undefined
      // UI ordering annotations
      const rawUiAfter = this.getValue(node, ['_ui_after', 'ui_after'])
      const uiAfterId = typeof rawUiAfter === 'string' ? rawUiAfter : (Array.isArray(rawUiAfter) && rawUiAfter.length > 0 ? String(rawUiAfter[0]) : undefined)
      concept.uiAfter = uiAfterId
      concept.uiFirst = this.getValue(node, ['_ui_first', 'ui_first']) as string | undefined
    }

    return concept
  }

   /**
    * Normalizes a single ref or array-of-refs field down to an array of ids.
    * Handles embedded objects ({@id}), plain strings, and comma-separated
    * strings within array elements (e.g. "type:a,type:b" → ["type:a","type:b"]).
    * @param value - The raw reference value.
    * @returns Array of resolved id strings, or undefined if no valid refs found.
    */
  private idsOf(value: unknown): string[] | undefined {
    if (value === undefined || value === null) return undefined
    const arr = Array.isArray(value) ? value : [value]
    // Expand comma-separated strings before extracting IDs
    const expanded = arr.flatMap(v => {
      if (typeof v === 'string' && v.includes(',')) {
        return v.split(',').map(s => s.trim()).filter(Boolean)
      }
      return [v]
    })
    const ids = expanded.map(v => this.idOf(v)).filter((v): v is string => v !== undefined)
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

  /**
   * Normalizes a conditionValue by extracting the local comparison value from URI-style strings.
   * Handles patterns like "concept:true", "sh:#true", full URIs with fragments/paths,
   * and plain strings. Returns lowercase for consistent case-insensitive matching.
   */
  private normalizeConditionValue(conditionValue: string): string {
    // Already a plain boolean-like string — return as-is
    if (/^(true|false)$/i.test(conditionValue.trim())) return conditionValue.trim().toLowerCase()

    // Try to extract local name from URI patterns:
    // - "#fragment" → fragment text without hash
    // - "/path/to/value" → last path segment
    // - "prefix:value" → value after colon (only if no scheme://)
    let result: string | null = null

    const hashMatch = conditionValue.match(/#[^#/]+$/)
    if (hashMatch) {
      result = hashMatch[0].substring(1)
    } else {
      const slashMatch = conditionValue.match(/\/([^/?#]+)\s*$/)
      if (slashMatch) {
        result = slashMatch[1]
      }
      // Fallback: try colon prefix stripping only if it looks like a namespace prefix
      // (no :// which would indicate a URL scheme)
      if (!result && !conditionValue.includes('://')) {
        const colonIdx = conditionValue.indexOf(':')
        if (colonIdx > 0 && colonIdx < conditionValue.length - 1) {
          result = conditionValue.substring(colonIdx + 1)
        }
      }
    }

    return result ? result.trim().toLowerCase() : conditionValue.trim()
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

  /**
   * Returns top-level (root) concepts for a scheme — i.e., hasTopConcept entries
   * that have no isPartOf reference. Composite children (fields with `isPartOf` set)
   * are excluded so they're only rendered as part of their parent's group.
   */
  getTopLevelConcepts(result: CodelistResult, schemeId: string): Concept[] {
    return this.getTopConceptsForScheme(result, schemeId).filter(concept => !concept.isPartOf?.length)
  }

   getChildren(result: CodelistResult, concept: Concept): Concept[] {
     if (!concept.hasPart) return []
     return concept.hasPart
       .map(id => result.concepts.get(id))
       .filter((c): c is Concept => c !== undefined)
   }

   /**
    * Returns children of a composite concept with mutually `related` concepts merged into
    * synthetic groups. For example, bestemmingsidentificatie-be/buitenland/none/werf are
    * replaced by one "Bestemmingsidentificatie" group whose children are deduped and ordered
    * by first appearance. The merge is driven entirely by the `related` annotation in the
    * codelist; no concept names are hardcoded here.
    */
   getChildrenMerged(result: CodelistResult, concept: Concept): Concept[] {
     const rawChildren = this.getChildren(result, concept)
     if (rawChildren.length < 2) return rawChildren

     // Connected components among siblings via `related` (BFS restricted to the sibling set).
     const childIds = new Set(rawChildren.map(c => c.id))
     const components: Concept[][] = []
     const visited = new Set<string>()

     for (const child of rawChildren) {
       if (visited.has(child.id)) continue
       const component: Concept[] = [child]
       visited.add(child.id)
       const queue: string[] = [...(child.related ?? [])]
       while (queue.length > 0) {
         const neighborId = queue.shift()!
         if (!neighborId || !childIds.has(neighborId) || visited.has(neighborId)) continue
         visited.add(neighborId)
         const neighbor = result.concepts.get(neighborId)
         if (!neighbor) continue
         component.push(neighbor)
         for (const ref of neighbor.related ?? []) {
           if (childIds.has(ref) && !visited.has(ref)) queue.push(ref)
         }
       }
       components.push(component)
     }

     const out: Concept[] = []
     for (const component of components) {
       if (component.length === 1) {
         out.push(component[0])
       } else {
         out.push(this.mergeRelatedGroup(result, component))
       }
     }
     return out
   }

   /**
    * Merge a component of mutually `related` sibling composites into one synthetic group
    * concept. Children are the deduplicated union of the members' children; a child that
    * appears in multiple members is required only when ALL its appearances require it.
    */
   private mergeRelatedGroup(result: CodelistResult, members: Concept[]): Concept {
     const ids = members.map(m => m.id)
     const first = members[0]

     // Merged id: longest common prefix of the local parts, scheme prefix restored once.
     const schemePrefix = ids[0].substring(0, ids[0].lastIndexOf(':') + 1)
     const localParts = ids.map(id => id.substring(schemePrefix.length))
     const commonLocal = this.longestCommonPrefix(localParts).replace(/-+$/, '')
     const mergedId = `${schemePrefix}${commonLocal}`

     const sharedConditionPath = members.find(m => m.conditionPath)?.conditionPath

     // Distinct union of condition values across members.
     const groupValues = new Set<string>()
     for (const m of members) {
       for (const cv of m.conditionValues ?? []) groupValues.add(cv)
       if (typeof m.conditionValue === 'string') groupValues.add(m.conditionValue)
     }

     // Dedupe children across members by (relation + lowercase prefLabel), tracking per-variant appearances.
     type Appearance = { conditionValue: string | undefined; required: boolean }
     const childByKey = new Map<string, { child: Concept; appearances: Appearance[] }>()
     for (const member of members) {
       const variantConditionValue = typeof member.conditionValue === 'string' ? member.conditionValue : undefined
       for (const gc of this.getChildren(result, member)) {
         const key = `${gc.relation ?? ''}::${(gc.prefLabel ?? '').trim().toLowerCase()}`
         const entry = childByKey.get(key)
         if (entry) {
           entry.appearances.push({ conditionValue: variantConditionValue, required: gc.isVerplicht === true })
         } else {
           childByKey.set(key, {
             child: gc,
             appearances: [{ conditionValue: variantConditionValue, required: gc.isVerplicht === true }],
           })
         }
       }
     }

     // Merged children, ordered by first appearance across members (data order).
     const mergedChildren: Concept[] = []
     for (const [key, { child, appearances }] of childByKey) {
       const values = new Set<string>()
       for (const a of appearances) if (a.conditionValue) values.add(a.conditionValue)
       const multiVariant = appearances.length > 1
       const allRequired = appearances.every(a => a.required)
       mergedChildren.push({
         id: `merged::${key}`,
         type: ['skos:Concept'],
         prefLabel: child.prefLabel,
         relation: child.relation,
         relevantDataType: child.relevantDataType,
         conditionPath: sharedConditionPath,
         conditionValues: [...values],
         // Shared children: required iff required in ALL appearances. Single-variant: its own flag.
         isVerplicht: multiVariant ? allRequired : appearances[0].required,
         uiFirst: child.uiFirst,
         uiAfter: child.uiAfter,
       })
     }

     // Register the synthetic group and its children so getChildren() can resolve them on re-render.
     const synthetic: Concept = {
       id: mergedId,
       type: ['skos:Concept'],
       prefLabel: first.prefLabel,
       definition: first.definition,
       hasPart: mergedChildren.map(c => c.id),
       conditionPath: sharedConditionPath,
       conditionValues: [...groupValues],
       isVerplicht: false,
       isMeervoudig: first.isMeervoudig,
       uiFirst: first.uiFirst,
       uiAfter: first.uiAfter,
     }
     for (const c of mergedChildren) result.concepts.set(c.id, c)
     result.concepts.set(synthetic.id, synthetic)
     return synthetic
   }
   private longestCommonPrefix(strings: string[]): string {
     if (strings.length === 0) return ''
     let prefix = strings[0]
     for (let i = 1; i < strings.length; i++) {
       while (!strings[i].startsWith(prefix)) {
         prefix = prefix.slice(0, -1)
         if (prefix === '') return ''
       }
     }
     return prefix
   }

  getParent(result: CodelistResult, concept: Concept): Concept | null {
    const parentId = concept.isPartOf?.[0]
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
   * Kept for backward compatibility with older codelist formats where relevantRiepr was used
   * for theme→scheme navigation. New format uses seeAlso instead.
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

  /**
   * Resolves `seeAlso` references on a concept or scheme to their target nodes.
   * In the updated codelist format, `seeAlso` is used for:
   * - Theme → operationeel scheme navigation (replacing relevantRiepr for this purpose)
   * - Multi-step flow chaining within operational schemes (e.g., feature_bron → lucht_rapportering)
   *
   * External references (ADMS status URIs, etc.) that don't resolve to local
   * schemes or concepts are silently dropped.
   * @param result - The parsed codelist result containing schemes and concepts for lookup.
   * @param node - The scheme or concept whose seeAlso refs to resolve.
   * @returns Array of resolved scheme/concept objects for each valid ref.
   */
  getSeeAlsoRefs(result: CodelistResult, node: Scheme | Concept): (Scheme | Concept)[] {
    if (!node.seeAlso) return []
    return node.seeAlso
      .map(id => result.schemes.get(id) ?? result.concepts.get(id))
      .filter((n): n is Scheme | Concept => n !== undefined)
  }

  /**
   * Resolves the operationeel scheme id from a thema concept using `seeAlso`.
   * Falls back to `relevantRiepr` for backward compatibility with older codelists.
   * @param result - The parsed codelist result.
   * @param themeConcept - The selected thema concept.
   * @returns The operationeel scheme id if found, otherwise undefined.
   */
  resolveOperationeelSchemeId(result: CodelistResult, themeConcept: Concept): string | undefined {
    // Primary: use seeAlso (new format)
    const seeAlsoSchemes = this.getSeeAlsoRefs(result, themeConcept).filter(
      ref => ref.type?.includes('skos:ConceptScheme'),
    ) as Scheme[]
    if (seeAlsoSchemes.length > 0) return seeAlsoSchemes[0].id

    // Fallback: use relevantRiepr (old format)
    const rieprRefs = this.getRelevantRieprRefs(result, themeConcept)
    const scheme = rieprRefs.find(ref => ref.type?.includes('skos:ConceptScheme'))
    return scheme?.id
  }
}
