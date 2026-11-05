const skos = 'http://www.w3.org/2004/02/skos/core#'
const vocab = 'https://data.riepr.omgeving.vlaanderen.be/ns/vocab#'

const namespaces: Readonly<Record<string, string>> = {
  skos, sosa: 'http://www.w3.org/ns/sosa/', xsd: 'http://www.w3.org/2001/XMLSchema#',
  riepr: 'https://data.riepr.omgeving.vlaanderen.be/ns/riepr#',
  dcterms: 'http://purl.org/dc/terms/', rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  qudt: 'http://qudt.org/schema/qudt/',
  schema: 'https://schema.org/',
}

export function vocabularyIri(value: string): string {
  const colon = value.indexOf(':')
  const base = namespaces[value.slice(0, colon)]
  return base ? base + value.slice(colon + 1) : value
}

export function localName(value: string): string {
  return value.slice(Math.max(value.lastIndexOf('#'), value.lastIndexOf('/'), value.lastIndexOf(':')) + 1)
}

export const predicateIris: Readonly<Record<string, string>> = {
  prefLabel: `${skos}prefLabel`,
  has_pref_label: `${skos}prefLabel`,
  definition: `${skos}definition`,
  has_definition: `${skos}definition`,
  note: `${skos}note`,
  has_note: `${skos}note`,
  altLabel: `${skos}altLabel`,
  alt_label: `${skos}altLabel`,
  code: `${skos}notation`,
  notation: `${skos}notation`,
  inScheme: `${skos}inScheme`,
  in_scheme: `${skos}inScheme`,
  hasTopConcept: `${skos}hasTopConcept`,
  has_top_concept: `${skos}hasTopConcept`,
  topConceptOf: `${skos}topConceptOf`,
  top_concept_of: `${skos}topConceptOf`,
  member: `${skos}member`,
  related: `${skos}related`,
  narrower: `${skos}narrower`,
  broaderPartitive: 'http://purl.org/iso25964/skos-thes#broaderPartitive',
  narrowerPartitive: 'http://purl.org/iso25964/skos-thes#narrowerPartitive',
  hasPart: 'http://purl.org/dc/terms/hasPart',
  vervolgstap: 'http://purl.org/linked-data/cube#codeList',
  seeAlso: 'http://www.w3.org/2000/01/rdf-schema#seeAlso',
  see_also: 'http://www.w3.org/2000/01/rdf-schema#seeAlso',
  relevantClass: 'http://www.w3.org/ns/shacl#class',
  relevant_class: 'http://www.w3.org/ns/shacl#class',
  conditionPath: 'http://www.w3.org/ns/shacl#path',
  condition_path: 'http://www.w3.org/ns/shacl#path',
  conditionValue: 'http://www.w3.org/ns/shacl#hasValue',
  condition_value: 'http://www.w3.org/ns/shacl#hasValue',
  relation: 'http://purl.org/dc/terms/relation',
  relevantUnit: 'http://qudt.org/schema/qudt/relevantUnit',
  relevant_unit: 'http://qudt.org/schema/qudt/relevantUnit',
  minValue: 'https://schema.org/minValue',
  maxValue: 'https://schema.org/maxValue',
  _ui_first: `${vocab}uiFirst`,
  ui_first: `${vocab}uiFirst`,
  _ui_after: `${vocab}uiAfter`,
  ui_after: `${vocab}uiAfter`,
}

export const semanticPredicateIris: Readonly<Record<string, string>> = Object.fromEntries([
  ...Object.entries(predicateIris),
  ...[
    'relevantRiepr', 'relevantDataType', 'relevantCodeList', 'relevantProperty',
    'relevantFeatureClass', 'relevantObservation', 'isVerplicht',
    'isMeervoudig', 'isMeetbaar', 'isOnzichtbaar', 'isMultiselect',
    'kwantiteitsAspect', 'drager', 'soortWaartbepaling', 'variabele',
  ].flatMap(term => [
    [term, `${vocab}${term}`],
    [term.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`), `${vocab}${term}`],
  ]),
])
