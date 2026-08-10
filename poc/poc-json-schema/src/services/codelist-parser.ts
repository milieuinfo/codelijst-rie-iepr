import type { Concept, CodelistResult, JsonLdNode, Scheme } from '../models/index.js'

const SCHEME_TYPES = ['skos:ConceptScheme']
const CONCEPT_TYPES = ['skos:Concept']

import * as fs from 'node:fs'
import { CurieExpander } from './curie-expander.js'

export class CodelistParser {
  private curieExpander: CurieExpander | null = null

  loadFromFile(filePath: string): CodelistResult {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return this.parseData(data)
  }

  parseData(data: Record<string, unknown>): CodelistResult {
    const context = data['@context'] as Record<string, unknown> | undefined
    if (context && typeof context === 'object') {
      this.curieExpander = new CurieExpander(context)
    }
    const graph = Array.isArray(data['graph']) ? data['graph'] : data['graph'] ? [data['graph']] : []
    const nodesById = this.buildNodeIndex(graph)
    const schemes = new Map<string, Scheme>()
    const concepts = new Map<string, Concept>()

    for (const [id, node] of nodesById.entries()) {
      const types = this.getTypes(node)
      if (types.some(t => SCHEME_TYPES.includes(t))) {
        schemes.set(id, this.toScheme(node))
      }
      if (types.some(t => CONCEPT_TYPES.includes(t))) {
        concepts.set(id, this.toConcept(node, true))
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

    const result: CodelistResult = {
      nodesById,
      schemes,
      concepts,
      topConcepts,
      expandCurie: this.curieExpander ? (curie: string) => this.curieExpander!.expand(curie) : (c) => c,
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
    return Array.isArray(raw) ? raw.filter((t): t is string => typeof t === 'string') : [String(raw)]
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
      isPartOf: this.idsOf(this.getValue(node, ['isPartOf', 'broader'])),
      narrower: this.idsOf(this.getValue(node, ['narrower'])),
      topConceptOf: this.idOf(this.getValue(node, ['topConceptOf', 'top_concept_of'])),
      relevantProperty: this.getValue(node, ['relevantProperty', 'relevant_property']) as string | undefined,
    }

    const relevantDataType = this.getValue(node, ['relevantDataType', 'relevant_data_type'])
    concept.relevantDataType = typeof relevantDataType === 'string' ? relevantDataType : undefined

    const cpIds = this.idsOf(this.getValue(node, ['conditionPath', 'condition_path'])) ?? []
    concept.conditionPath = cpIds.length > 0 ? cpIds[0] : undefined

    const cvIds = this.idsOf(this.getValue(node, ['conditionValue', 'condition_value'])) ?? []
    concept.conditionValue = cvIds.length > 0 ? this.normalizeConditionValue(cvIds[0]) : undefined

    // relevantCodeList: keep raw CURIEs for scheme map lookups; expand at enum output time
    concept.relevantCodeList = this.idsOf(this.getValue(node, ['relevantCodeList', 'relevant_code_list']))
    // relevantRiepr: keep raw CURIEs for internal matching
    concept.relevantRiepr = this.idsOf(this.getValue(node, ['relevantRiepr', 'relevant_riepr']))
    // relevantUnit: expand to full URIs — consumed directly by schema output
    concept.relevantUnit = this.idsOf(this.getValue(node, ['relevantUnit', 'relevant_unit']), true)
    concept.seeAlso = this.idsOf(this.getValue(node, ['seeAlso', 'see_also']))
    concept.relevantClass = typeof this.getValue(node, ['relevantClass', 'relevant_class']) === 'string'
      ? String(this.getValue(node, ['relevantClass', 'relevant_class']))
      : undefined

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

    // related: alternative composite variant concept IDs
    concept.related = this.idsOf(this.getValue(node, ['related']))

    return concept
  }

  private idsOf(value: unknown, expand = false): string[] | undefined {
    if (value === undefined || value === null) return undefined
    const arr = Array.isArray(value) ? value : [value]
    const expanded = arr.flatMap(v => {
      if (typeof v === 'string' && v.includes(',')) {
        return v.split(',').map(s => s.trim()).filter(Boolean)
      }
      return [v]
    })
    let ids = expanded.map(v => this.idOf(v)).filter((v): v is string => v !== undefined)
    if (expand) ids = ids.map(id => this.curieExpander!.expand(id))
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
      if (obj[key] !== undefined) return obj[key]
    }
    return undefined
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
