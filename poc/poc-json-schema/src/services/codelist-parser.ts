import type { Concept, CodelistResult, JsonLdNode, Scheme } from '../models/index.js'

const SCHEME_TYPES = ['skos:ConceptScheme']
const CONCEPT_TYPES = ['skos:Concept']
const COLLECTION_TYPES = ['skos:Collection']

import * as fs from 'node:fs'
import { CurieExpander } from './curie-expander.js'
import { semanticPredicateIris } from './vocabulary.js'

export class CodelistParser {
  private curieExpander: CurieExpander | null = null
  private context: Record<string, unknown> = {}

  loadFromFile(filePath: string): CodelistResult {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return this.parseData(data)
  }

  parseData(data: Record<string, unknown>): CodelistResult {
    this.curieExpander = null
    this.context = {}
    const context = data['@context'] as Record<string, unknown> | undefined
    if (context && typeof context === 'object') {
      this.curieExpander = new CurieExpander(context)
      this.context = context
    }
    const rawGraph = data['@graph'] ?? data['graph']
    const graph = Array.isArray(rawGraph) ? rawGraph : rawGraph ? [rawGraph] : []
    const nodesById = this.buildNodeIndex(graph)
    const schemes = new Map<string, Scheme>()
    const concepts = new Map<string, Concept>()
    const collections = new Map<string, string[]>()

    for (const [id, node] of nodesById.entries()) {
      const types = this.getTypes(node)
      if (types.some(t => SCHEME_TYPES.includes(t))) {
        schemes.set(id, this.toScheme(node))
      }
      if (types.some(t => CONCEPT_TYPES.includes(t))) {
        concepts.set(id, this.toConcept(node, true))
      }
      if (types.some(t => COLLECTION_TYPES.includes(t))) {
        collections.set(id, this.idsOf(this.getValue(node, ['member'])) ?? [])
      }
    }

    const topConcepts = new Map<string, Concept[]>()
    for (const [schemeId, node] of nodesById.entries()) {
      const hasTopConcept = this.getValue(node, ['hasTopConcept', 'has_top_concept'])
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

    const expander = this.curieExpander
    const entries = data['x-reporting-entries']
    let reportingEntries: CodelistResult['reportingEntries']
    if (entries !== undefined) {
      if (!Array.isArray(entries) || !entries.length) throw new Error('Invalid reporting entries: expected a nonempty array.')
      reportingEntries = entries.map((value: unknown) => {
        if (!value || typeof value !== 'object') throw new Error('Invalid reporting entries: expected an object.')
        const { schemeId, slug, label } = value as Record<string, unknown>
        if (typeof schemeId !== 'string' || !schemeId || typeof label !== 'string' || !label ||
            typeof slug !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(slug)) {
          throw new Error('Invalid reporting entries: schemeId, slug and label are required.')
        }
        return { schemeId, slug, label }
      })
    }
    const result: CodelistResult = {
      reportingProfile: typeof data['x-source-profile'] === 'string' ? data['x-source-profile'] : undefined,
      reportingEntries,
      nodesById,
      schemes,
      concepts,
      topConcepts,
      collections,
      expandCurie: expander ? (curie: string) => expander.expand(curie) : (c) => c,
    }
    return result
  }

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
    const values = Array.isArray(raw) ? raw.filter((t): t is string => typeof t === 'string') : [String(raw)]
    return values.map(value => {
      const iri = this.curieExpander?.expand(value) ?? value
      return iri.startsWith('http://www.w3.org/2004/02/skos/core#')
        ? `skos:${iri.slice('http://www.w3.org/2004/02/skos/core#'.length)}`
        : value
    })
  }

  private toScheme(node: JsonLdNode): Scheme {
    return {
      id: String(this.idOf(node)),
      type: this.getTypes(node),
      prefLabel: this.getValue(node, ['prefLabel', 'has_pref_label']) as string | undefined,
      definition: this.getValue(node, ['definition', 'has_definition']) as string | undefined,
      note: this.getValue(node, ['note', 'has_note']) as string | undefined,
      relevantRiepr: this.idsOf(this.getValue(node, ['relevantRiepr', 'relevant_riepr']), true),
      seeAlso: this.idsOf(this.getValue(node, ['seeAlso', 'see_also'])),
      vervolgstap: this.idsOf(this.getValue(node, ['vervolgstap'])),
    }
  }

  private toConcept(node: JsonLdNode, normalizeBooleans: boolean): Concept {
    // Keep internal references as raw CURIEs for map lookups; expand at output time
    const concept: Concept = {
      id: String(this.idOf(node)),
      type: this.getTypes(node),
      inScheme: this.idOf(this.getValue(node, ['inScheme', 'in_scheme'])),
      code: this.getValue(node, ['code', 'notation']) as string | undefined,
      prefLabel: this.getValue(node, ['prefLabel', 'has_pref_label']) as string | undefined,
      altLabel: this.getValue(node, ['altLabel', 'alt_label']) as string[] | undefined,
      definition: this.getValue(node, ['definition', 'has_definition']) as string | undefined,
      note: this.getValue(node, ['note', 'has_note']) as string | undefined,
      broaderPartitive: this.idsOf(this.getValue(node, ['broaderPartitive'])),
      narrower: this.idsOf(this.getValue(node, ['narrowerPartitive', 'hasPart', 'narrower'])),
      topConceptOf: this.idOf(this.getValue(node, ['topConceptOf', 'top_concept_of'])),
      relevantProperty: this.getValue(node, ['relevantProperty', 'relevant_property']) as string | undefined,
    }

    concept.relevantDataType = this.idOf(this.getValue(node, ['relevantDataType', 'relevant_data_type']))

    const cpIds = this.idsOf(this.getValue(node, ['conditionPath', 'condition_path'])) ?? []
    if (cpIds.length > 1) throw new Error(`Multiple conditionPath entries on ${concept.id}; expected one source trigger.`)
    concept.conditionPath = cpIds.length > 0 ? cpIds[0] : undefined

    const rawConditions = this.getValue(node, ['conditionValue', 'condition_value'])
    if (Array.isArray(rawConditions) && rawConditions.length > 1) {
      throw new Error(`Multiple conditionValue entries on ${concept.id}; expected one source condition.`)
    }
    const rawCondition = Array.isArray(rawConditions) ? rawConditions[0] : rawConditions
    const condition = rawCondition && typeof rawCondition === 'object'
      ? this.idOf(rawCondition) ?? (rawCondition as Record<string, unknown>)['@value'] ??
        (rawCondition as Record<string, unknown>)['_value']
      : rawCondition
    if (condition !== undefined && condition !== null) {
      if (!['string', 'number', 'boolean'].includes(typeof condition)) {
        throw new Error(`Unsupported conditionValue on ${concept.id}.`)
      }
      concept.conditionValue = String(condition)
    }

    // relevantCodeList: keep raw CURIEs for scheme map lookups; expand at enum output time
    concept.relevantCodeList = this.idsOf(this.getValue(node, ['relevantCodeList', 'relevant_code_list']))
    // relevantRiepr: keep raw CURIEs for internal matching
    concept.relevantRiepr = this.idsOf(this.getValue(node, ['relevantRiepr', 'relevant_riepr']))
    // relevantUnit: expand to full URIs — consumed directly by schema output
    concept.relevantUnit = this.idsOf(this.getValue(node, ['relevantUnit', 'relevant_unit']), true)
    concept.seeAlso = this.idsOf(this.getValue(node, ['seeAlso', 'see_also']))
    concept.vervolgstap = this.idsOf(this.getValue(node, ['vervolgstap']))
    concept.relevantClass = this.idOf(this.getValue(node, ['relevantClass', 'relevant_class']))
    concept.relevantObservation = this.idsOf(this.getValue(node, ['relevantObservation']))
    concept.relevantFeatureClass = this.idsOf(this.getValue(node, ['relevantFeatureClass']))
    concept.tableWorkbook = node._table_workbook as string | undefined
    concept.tableSheet = node._table_sheet as string | undefined
    concept.tableKey = this.idsOf(node._table_key)
    concept.referenceParent = this.idOf(this.getValue(node, ['referenceParent']))
    concept.referenceRelation = this.idOf(this.getValue(node, ['referenceRelation']))
    concept.tableOrder = typeof node._table_order === 'number' ? node._table_order : undefined

    const rawRelation = this.getValue(node, ['relation'])
    if (typeof rawRelation === 'string') {
      concept.relation = rawRelation
    } else if (rawRelation && typeof rawRelation === 'object') {
      const id = this.idOf(rawRelation)
      concept.relation = id ?? undefined
    }

    // min/max value constraints (Issue-SCHEMA-01 — once CSV columns are populated)
    const rawMin = this.getNumeric(node, ['minValue'])
    if (rawMin !== undefined) concept.minValue = rawMin
    const rawMax = this.getNumeric(node, ['maxValue'])
    if (rawMax !== undefined) concept.maxValue = rawMax

    if (normalizeBooleans) {
      concept.isVerplicht = this.parseBoolean(this.getValue(node, ['isVerplicht', 'is_verplicht']))
      concept.isMeervoudig = this.parseBoolean(this.getValue(node, ['isMeervoudig', 'is_meervoudig']))
      concept.isMeetbaar = this.parseBoolean(this.getValue(node, ['isMeetbaar', 'is_meetbaar']))
      concept.isOnzichtbaar = this.parseBoolean(this.getValue(node, ['isOnzichtbaar', 'is_onzichtbaar']))
      concept.isMultiselect = this.parseBoolean(this.getValue(node, ['isMultiselect', 'is_multiselect']))
      // UI ordering annotations
      concept.uiFirst = this.parseBoolean(this.getValue(node, ['_ui_first', 'ui_first']))
      concept.uiAfter = this.idOf(this.getValue(node, ['_ui_after', 'ui_after']))
    } else {
      concept.isVerplicht = this.getValue(node, ['isVerplicht', 'is_verplicht']) as string | undefined
      concept.isMeervoudig = this.getValue(node, ['isMeervoudig', 'is_meervoudig']) as string | undefined
      concept.isMeetbaar = this.getValue(node, ['isMeetbaar', 'is_meetbaar']) as string | undefined
      concept.isOnzichtbaar = this.getValue(node, ['isOnzichtbaar', 'is_onzichtbaar']) as string | undefined
      concept.isMultiselect = this.getValue(node, ['isMultiselect', 'is_multiselect']) as string | undefined
      // UI ordering annotations
      const rawUiAfter = this.getValue(node, ['_ui_after', 'ui_after'])
      concept.uiAfter = typeof rawUiAfter === 'string' ? rawUiAfter : this.idOf(rawUiAfter)
      concept.uiFirst = this.parseBoolean(this.getValue(node, ['_ui_first', 'ui_first']))
    }

    // CSOR semantics of a value field (kept as CURIEs; expanded at output time)
    concept.kwantiteitsAspect = this.idOf(this.getValue(node, ['kwantiteitsAspect']))
    concept.drager = this.idOf(this.getValue(node, ['drager']))
    concept.soortWaartbepaling = this.idOf(this.getValue(node, ['soortWaartbepaling']))
    concept.variabele = this.idOf(this.getValue(node, ['variabele']))

    // related: alternative composite variant concept IDs
    concept.related = this.idsOf(this.getValue(node, ['related']))

    return concept
  }

  private idsOf(value: unknown, expand = false): string[] | undefined {
    if (value === undefined || value === null) return undefined
    const arr = Array.isArray(value) ? value : [value]
    const expanded = arr.flatMap(v => {
      if (typeof v === 'string' && /[,|]/.test(v)) {
        return v.split(/[,|]/).map(s => s.trim()).filter(Boolean)
      }
      return [v]
    })
    let ids = expanded.map(v => this.idOf(v)).filter((v): v is string => v !== undefined)
    if (expand) ids = ids.map(id => this.curieExpander?.expand(id) ?? id)
    return ids.length > 0 ? ids : undefined
  }

  /** Expand a single optional CURIE to its full URI form (if context has the prefix). */
  private expandCuries(id: string | undefined): string | undefined {
    if (!id) return id
    return this.curieExpander!.expand(id)
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

  normalizeConditionValue(conditionValue: string): string {
    if (/^(true|false)$/i.test(conditionValue.trim())) return conditionValue.trim().toLowerCase()
    let result: string | null = null
    const hashMatch = conditionValue.match(/#[^#/]+$/)
    if (hashMatch) {
      result = hashMatch[0].substring(1)
    } else {
      const slashMatch = conditionValue.match(/\/([^/?#]+)\s*$/)
      if (slashMatch) {
        result = slashMatch[1]
      }
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
      const iri = semanticPredicateIris[key]
      if (obj[key] !== undefined && (!iri || !Object.hasOwn(this.context, key) || this.predicateIri(key) === iri)) return obj[key]
      if (iri) {
        for (const [sourceKey, value] of Object.entries(obj)) {
          if (this.predicateIri(sourceKey) === iri) return value
        }
      }
    }
    return undefined
  }

  private predicateIri(key: string): string {
    const term = this.context[key]
    const id = typeof term === 'string' ? term
      : term && typeof term === 'object' && '@id' in term ? term['@id']
        : key
    return typeof id === 'string' ? this.curieExpander?.expand(id) ?? id : key
  }

  private getNumeric(obj: Record<string, unknown>, keys: string[]): number | undefined {
    const raw = this.getValue(obj, keys)
    if (raw === undefined || raw === null) return undefined
    // JSON-LD typed literal: { "_type": "xsd:decimal", "_value": "123.4" }
    if (typeof raw === 'object' && '_value' in raw) {
      const parsed = Number(String(raw._value))
      return Number.isFinite(parsed) ? parsed : undefined
    }
    if (typeof raw === 'number') return raw
    if (typeof raw === 'string') {
      const parsed = Number(raw)
      return Number.isFinite(parsed) ? parsed : undefined
    }
    return undefined
  }
}
