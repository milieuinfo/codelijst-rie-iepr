/**
 * Parses the RIE-IEPR codelist (Turtle, `rie-iepr.ttl`) into a `CodelistResult`.
 *
 * The document is read as RDF with N3.js: every property and type is matched
 * on its full IRI (see `vocab.ts`), never on a CSV column or JSON-LD term name.
 * IRIs are compacted to CURIE ids (`lucht:brandstof`) for use in the rest of
 * the POC, with the POC's own prefixes taking precedence over the document's.
 */

import { Parser, type Term } from 'n3'
import type { CodelistResult, RdfNode, Scheme, Concept } from '../models/index.js'
import {
  DCTERMS_HAS_PART, PREFIXES, QB_CODE_LIST, QUDT_RELEVANT_UNIT, RDF_TYPE, SH, SKOS, THES, VOCAB,
} from './vocab.js'

/** Compacts IRIs to CURIEs with the longest matching namespace. */
type Compact = (iri: string) => string

/**
 * Build the compaction function for a prefix map.
 * @param prefixes - Prefix → namespace IRI.
 * @returns A function that compacts an IRI, leaving it absolute when no namespace matches.
 */
function compactor(prefixes: Record<string, string>): Compact {
  // Longest namespace first, so `csor_eenheid:` wins over a broader `csor:`-like namespace.
  const namespaces = Object.entries(prefixes).sort(([, a], [, b]) => b.length - a.length)
  return (iri: string) => {
    for (const [prefix, ns] of namespaces) {
      if (iri.startsWith(ns) && iri.length > ns.length) return `${prefix}:${iri.slice(ns.length)}`
    }
    return iri
  }
}

/**
 * The string form of an object term: a compacted id for IRIs, the lexical value for literals.
 * @param term - The RDF term.
 * @param compact - The IRI compaction function.
 * @returns The value as used in the typed views.
 */
function valueOf(term: Term, compact: Compact): string {
  return term.termType === 'NamedNode' ? compact(term.value) : term.value
}

/**
 * All values of a property as ids / lexical values.
 * @param node - The subject's properties.
 * @param predicate - The property IRI.
 * @param compact - The IRI compaction function.
 * @returns The values, or undefined when the property is absent.
 */
function values(node: RdfNode, predicate: string, compact: Compact): string[] | undefined {
  const terms = node.get(predicate)
  return terms && terms.length > 0 ? terms.map(t => valueOf(t, compact)) : undefined
}

/**
 * The first value of a property.
 * @param node - The subject's properties.
 * @param predicate - The property IRI.
 * @param compact - The IRI compaction function.
 * @returns The first value, or undefined when the property is absent.
 */
function value(node: RdfNode, predicate: string, compact: Compact): string | undefined {
  return values(node, predicate, compact)?.[0]
}

/**
 * A label-like literal, preferring Dutch, then untagged, then any language.
 * @param node - The subject's properties.
 * @param predicate - The property IRI.
 * @returns The literal value, or undefined when the property is absent.
 */
function text(node: RdfNode, predicate: string): string | undefined {
  const literals = (node.get(predicate) ?? []).filter(t => t.termType === 'Literal')
  const pick = literals.find(l => l.language === 'nl') ?? literals.find(l => l.language === '') ?? literals[0]
  return pick?.value
}

/**
 * Convert a subject to a typed Scheme.
 * @param id - The compacted subject id.
 * @param node - The subject's properties.
 * @param compact - The IRI compaction function.
 * @returns The typed Scheme view.
 */
function toScheme(id: string, node: RdfNode, compact: Compact): Scheme {
  return {
    id,
    type: values(node, RDF_TYPE, compact) ?? [],
    prefLabel: text(node, SKOS.prefLabel),
    definition: text(node, SKOS.definition),
    note: text(node, SKOS.note),
    relevantRiepr: values(node, VOCAB.relevantRiepr, compact),
    vervolgstap: values(node, QB_CODE_LIST, compact),
  }
}

/**
 * Convert a subject to a typed Concept. All references are stored as id
 * strings; callers resolve them via `result.concepts.get(id)`.
 * @param id - The compacted subject id.
 * @param node - The subject's properties.
 * @param compact - The IRI compaction function.
 * @param normalizeBooleans - Whether to coerce flag fields to booleans.
 * @returns The typed Concept view.
 */
function toConcept(id: string, node: RdfNode, compact: Compact, normalizeBooleans: boolean): Concept {
  const hasPart = [
    ...(values(node, THES.narrowerPartitive, compact) ?? []),
    ...(values(node, DCTERMS_HAS_PART, compact) ?? []),
  ]
  const altLabels = (node.get(SKOS.altLabel) ?? []).filter(t => t.termType === 'Literal').map(t => t.value)

  const concept: Concept = {
    id,
    type: values(node, RDF_TYPE, compact) ?? [],
    inScheme: value(node, SKOS.inScheme, compact),
    code: value(node, SKOS.notation, compact),
    prefLabel: text(node, SKOS.prefLabel),
    altLabel: altLabels.length > 0 ? altLabels : undefined,
    definition: text(node, SKOS.definition),
    note: text(node, SKOS.note),
    broaderPartitive: values(node, THES.broaderPartitive, compact),
    hasPart: hasPart.length > 0 ? hasPart : undefined,
    topConceptOf: value(node, SKOS.topConceptOf, compact),
    semanticRelation: values(node, SKOS.semanticRelation, compact),
    relevantProperty: value(node, VOCAB.relevantProperty, compact),
    relevantDataType: value(node, VOCAB.relevantDataType, compact),
    related: values(node, SKOS.related, compact),
    relevantCodeList: values(node, VOCAB.relevantCodeList, compact),
    relevantRiepr: values(node, VOCAB.relevantRiepr, compact),
    relevantUnit: values(node, QUDT_RELEVANT_UNIT, compact),
    // CSOR semantics of a value field and the field holding its stof
    kwantiteitsAspect: value(node, VOCAB.kwantiteitsAspect, compact),
    drager: value(node, VOCAB.drager, compact),
    soortWaartbepaling: value(node, VOCAB.soortWaartbepaling, compact),
    variabele: value(node, VOCAB.variabele, compact),
    vervolgstap: values(node, QB_CODE_LIST, compact),
    relevantClass: value(node, SH.class, compact),
    uiAfter: value(node, VOCAB.uiAfter, compact),
  }

  concept.conditionPath = value(node, SH.path, compact)
  const conditionValues = values(node, SH.hasValue, compact) ?? []
  if (conditionValues.length > 0) {
    concept.conditionValue = normalizeConditionValue(conditionValues[0])
    concept.conditionValues = conditionValues.map(v => normalizeConditionValue(v))
  }

  const flag = (predicate: string): boolean | string | undefined => {
    const raw = value(node, predicate, compact)
    return normalizeBooleans ? parseBoolean(raw) : raw
  }
  concept.isVerplicht = flag(VOCAB.isVerplicht)
  concept.isMeervoudig = flag(VOCAB.isMeervoudig)
  concept.isMeetbaar = flag(VOCAB.isMeetbaar)
  concept.isOnzichtbaar = flag(VOCAB.isOnzichtbaar)
  concept.isMultiselect = flag(VOCAB.isMultiselect)
  concept.uiFirst = flag(VOCAB.uiFirst)

  return concept
}

/**
 * Normalizes a conditionValue by extracting the local comparison value from URI-style strings.
 * Handles patterns like "concept:true", "sh:#true", full URIs with fragments/paths,
 * and plain strings. Returns lowercase for consistent case-insensitive matching.
 * @param conditionValue - The raw conditionValue string.
 * @returns The normalized, lowercase comparison value.
 */
function normalizeConditionValue(conditionValue: string): string {
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

/**
 * Coerce a literal to `boolean | undefined`; accepts `"true"`/`"1"` and `"false"`/`"0"`.
 * @param value - The lexical value.
 * @returns The boolean, or undefined when it is not a recognizable boolean.
 */
function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined
  const lower = value.toLowerCase().trim()
  if (lower === 'true' || lower === '1') return true
  if (lower === 'false' || lower === '0') return false
  return undefined
}

/**
 * Parse the codelist Turtle document into a `CodelistResult`.
 * @param turtle - The Turtle (or N-Triples) document.
 * @param normalizeBooleans - Coerce `"true"`/`"false"` literals to booleans for flag fields.
 * @returns The parsed CodelistResult (nodesById, schemes, concepts, topConcepts, collections, prefixes).
 */
export function parseCodelist(turtle: string, normalizeBooleans: boolean): CodelistResult {
  const documentPrefixes: Record<string, string> = {}
  const quads = new Parser().parse(turtle, null, (prefix, iri) => { documentPrefixes[prefix] = iri.value })

  // The POC's own prefixes win: the CURIEs used in code must not depend on the publisher's prefix names.
  const ownNamespaces = new Set(Object.values(PREFIXES))
  const prefixes: Record<string, string> = {}
  for (const [prefix, ns] of Object.entries(documentPrefixes)) {
    if (!ownNamespaces.has(ns) && !(prefix in PREFIXES)) prefixes[prefix] = ns
  }
  Object.assign(prefixes, PREFIXES)
  const compact = compactor(prefixes)

  const nodesById = new Map<string, RdfNode>()
  for (const quad of quads) {
    if (quad.subject.termType !== 'NamedNode' && quad.subject.termType !== 'BlankNode') continue
    const id = quad.subject.termType === 'NamedNode' ? compact(quad.subject.value) : `_:${quad.subject.value}`
    let node = nodesById.get(id)
    if (!node) nodesById.set(id, node = new Map())
    const objects = node.get(quad.predicate.value)
    if (objects) objects.push(quad.object)
    else node.set(quad.predicate.value, [quad.object])
  }

  const schemes = new Map<string, Scheme>()
  const concepts = new Map<string, Concept>()
  const collections = new Map<string, string[]>()

  for (const [id, node] of nodesById.entries()) {
    const types = new Set((node.get(RDF_TYPE) ?? []).map(t => t.value))

    if (types.has(SKOS.ConceptScheme)) schemes.set(id, toScheme(id, node, compact))
    // A node can be both a skos:Concept and something else (e.g. qudt:Unit);
    // schemes and concepts are not mutually exclusive checks.
    if (types.has(SKOS.Concept)) concepts.set(id, toConcept(id, node, compact, normalizeBooleans))
    if (types.has(SKOS.Collection)) collections.set(id, values(node, SKOS.member, compact) ?? [])
  }

  const topConcepts = new Map<string, Concept[]>()
  for (const [schemeId, node] of nodesById.entries()) {
    const refs = values(node, SKOS.hasTopConcept, compact)
    if (!refs) continue
    topConcepts.set(schemeId, refs.map(ref => concepts.get(ref)).filter((c): c is Concept => c !== undefined))
  }

  return { nodesById, schemes, concepts, topConcepts, collections, prefixes }
}
