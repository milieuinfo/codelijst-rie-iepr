/**
 * The IRIs this POC depends on: the contract with the published codelist.
 *
 * The codelist is read as RDF (`rie-iepr.ttl`), so properties and types are
 * matched on their full IRI only. The column names of the source CSVs and the
 * term names of the JSON-LD context can change without affecting the POC; a
 * changed IRI here is a breaking change of the codelist.
 */

const SKOS_NS = 'http://www.w3.org/2004/02/skos/core#'
const VOCAB_NS = 'https://data.riepr.omgeving.vlaanderen.be/ns/vocab#'

export const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'

export const SKOS = {
  Concept: `${SKOS_NS}Concept`,
  ConceptScheme: `${SKOS_NS}ConceptScheme`,
  Collection: `${SKOS_NS}Collection`,
  prefLabel: `${SKOS_NS}prefLabel`,
  altLabel: `${SKOS_NS}altLabel`,
  definition: `${SKOS_NS}definition`,
  note: `${SKOS_NS}note`,
  notation: `${SKOS_NS}notation`,
  inScheme: `${SKOS_NS}inScheme`,
  topConceptOf: `${SKOS_NS}topConceptOf`,
  hasTopConcept: `${SKOS_NS}hasTopConcept`,
  member: `${SKOS_NS}member`,
  related: `${SKOS_NS}related`,
  semanticRelation: `${SKOS_NS}semanticRelation`,
}

export const THES = {
  broaderPartitive: 'http://purl.org/iso25964/skos-thes#broaderPartitive',
  narrowerPartitive: 'http://purl.org/iso25964/skos-thes#narrowerPartitive',
}

export const DCTERMS_HAS_PART = 'http://purl.org/dc/terms/hasPart'

export const SH = {
  path: 'http://www.w3.org/ns/shacl#path',
  hasValue: 'http://www.w3.org/ns/shacl#hasValue',
  class: 'http://www.w3.org/ns/shacl#class',
}

/** The next step of a flow (`vervolgstap` in the source CSVs). */
export const QB_CODE_LIST = 'http://purl.org/linked-data/cube#codeList'

export const QUDT_RELEVANT_UNIT = 'http://qudt.org/schema/qudt/relevantUnit'

export const VOCAB = {
  relevantCodeList: `${VOCAB_NS}relevantCodeList`,
  relevantDataType: `${VOCAB_NS}relevantDataType`,
  relevantProperty: `${VOCAB_NS}relevantProperty`,
  relevantRiepr: `${VOCAB_NS}relevantRiepr`,
  kwantiteitsAspect: `${VOCAB_NS}kwantiteitsAspect`,
  drager: `${VOCAB_NS}drager`,
  soortWaartbepaling: `${VOCAB_NS}soortWaartbepaling`,
  variabele: `${VOCAB_NS}variabele`,
  isVerplicht: `${VOCAB_NS}isVerplicht`,
  isMeervoudig: `${VOCAB_NS}isMeervoudig`,
  isMeetbaar: `${VOCAB_NS}isMeetbaar`,
  isOnzichtbaar: `${VOCAB_NS}isOnzichtbaar`,
  isMultiselect: `${VOCAB_NS}isMultiselect`,
  uiAfter: `${VOCAB_NS}uiAfter`,
  uiFirst: `${VOCAB_NS}uiFirst`,
}

/**
 * Prefixes the POC itself relies on when it compacts IRIs to the CURIE ids used
 * in code (`skos:Concept`, `xsd:decimal`, `conceptscheme:thema_type`,
 * `csor_eenheid:E_1`, ...). They take precedence over the prefixes declared in
 * the document, which are only used for all other namespaces.
 */
export const PREFIXES: Record<string, string> = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  skos: SKOS_NS,
  sosa: 'http://www.w3.org/ns/sosa/',
  unit: 'http://qudt.org/vocab/unit/',
  riepr: 'https://data.riepr.omgeving.vlaanderen.be/ns/riepr#',
  conceptscheme: 'https://data.omgeving.vlaanderen.be/id/conceptscheme/riepr/',
  collectie: 'https://data.omgeving.vlaanderen.be/id/collection/rie-iepr/',
  concept: 'https://data.omgeving.vlaanderen.be/id/concept/rie-iepr/',
  thema: 'https://data.omgeving.vlaanderen.be/id/concept/riepr/thema-type/',
  csor: 'https://data.omgeving.vlaanderen.be/id/conceptscheme/csor/',
  csor_eenheid: 'https://data.omgeving.vlaanderen.be/id/concept/csor/eenheid/',
  csor_variabele: 'https://data.omgeving.vlaanderen.be/id/concept/csor/variabele/',
  csor_drager: 'https://data.omgeving.vlaanderen.be/id/concept/csor/drager/',
  csor_kwantificeerbaaraspect: 'https://data.omgeving.vlaanderen.be/id/concept/csor/kwantificeerbaaraspect/',
  csor_soortwaardebepaling: 'https://data.omgeving.vlaanderen.be/id/concept/csor/soortwaardebepaling/',
}
