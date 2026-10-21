/**
 * @file Generates `src/generated/systeemvelden.json`: the fixed fields of each
 * systeem (naam, beschrijving, in gebruik vanaf/tot, externe identificatie),
 * derived from the `owl:Restriction`s in the RIE-IEPR ontology (`riepr.ttl`).
 *
 * The ontology lives in the sibling repository:
 * `../RIE-IEPR/src/main/resources/be/vlaanderen/omgeving/riepr/data/ns/riepr/riepr.ttl`
 *
 * The output is deterministic: the same input always produces byte-identical
 * JSON (keys in a fixed order, fields in ontology order).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Parser } from 'n3'
import { ENKELVOUDIG, LABELS, SYSTEMEN, UITGESLOTEN } from './systeemvelden-config.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pocRoot = resolve(__dirname, '..')
const repoRoot = resolve(pocRoot, '../..')

const TTL_PATH = resolve(
  repoRoot,
  '../RIE-IEPR/src/main/resources/be/vlaanderen/omgeving/riepr/data/ns/riepr/riepr.ttl',
)
const OUT_PATH = resolve(pocRoot, 'src/generated/systeemvelden.json')

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#'
const OWL = 'http://www.w3.org/2002/07/owl#'
const RIEPR = 'https://data.riepr.omgeving.vlaanderen.be/ns/riepr#'

if (!existsSync(TTL_PATH)) {
  console.warn('[build-systeemvelden] Datamodel niet gevonden op', TTL_PATH)
  console.warn(
    '[build-systeemvelden] De gegenereerde src/generated/systeemvelden.json blijft ongewijzigd. ' +
      'Check de sibling-repo ../RIE-IEPR uit om de velden te verversen.',
  )
  process.exit(0)
}

const turtle = readFileSync(TTL_PATH, 'utf8')
const quads = new Parser().parse(turtle)

/** Prefix map read from the document itself, so new prefixes need no code change. */
const prefixes = new Map()
for (const match of turtle.matchAll(/@prefix\s+([\w-]*):\s*<([^>]+)>/g)) {
  prefixes.set(match[2], match[1])
}

/**
 * Renders an IRI as a CURIE using the prefixes of the document.
 * @param {string} iri - The IRI to shorten.
 * @returns {string} The CURIE, or the IRI when no prefix matches.
 */
function curie(iri) {
  let best
  for (const [namespace, prefix] of prefixes) {
    if (iri.startsWith(namespace) && (!best || namespace.length > best.namespace.length)) {
      best = { namespace, prefix }
    }
  }
  return best ? `${best.prefix}:${iri.slice(best.namespace.length)}` : iri
}

/** Triples grouped by subject node id. */
const bySubject = new Map()
for (const quad of quads) {
  const key = quad.subject.value
  if (!bySubject.has(key)) bySubject.set(key, [])
  bySubject.get(key).push(quad)
}

/**
 * Reads the objects of one predicate for a node.
 * @param {string} nodeId - Subject node id.
 * @param {string} predicate - Full predicate IRI.
 * @returns {import('n3').Term[]} The objects.
 */
function objects(nodeId, predicate) {
  return (bySubject.get(nodeId) ?? [])
    .filter((quad) => quad.predicate.value === predicate)
    .map((quad) => quad.object)
}

/**
 * Collects the `owl:Restriction` blocks under `rdfs:subClassOf` of a class.
 * @param {string} klasse - Local class name (e.g. `Installatie`).
 * @returns {Record<string, unknown>[]} One object per usable restriction.
 */
function restrictionsOf(klasse) {
  const classId = RIEPR + klasse
  const fields = []

  for (const object of objects(classId, RDFS + 'subClassOf')) {
    if (object.termType !== 'BlankNode') continue
    const isRestriction = objects(object.value, RDF + 'type').some((type) => type.value === OWL + 'Restriction')
    if (!isRestriction) continue

    const onProperties = objects(object.value, OWL + 'onProperty')
    // Restrictions without a property are class axioms (e.g. owl:disjointWith).
    if (onProperties.length === 0) continue
    // Inverse properties (a blank node with owl:inverseOf) are structural, never form fields.
    if (onProperties[0].termType === 'BlankNode') continue

    const property = curie(onProperties[0].value)
    if (UITGESLOTEN[property]) continue

    const min = Number(objects(object.value, OWL + 'minCardinality')[0]?.value ?? '0')
    const maxRaw = objects(object.value, OWL + 'maxCardinality')[0]?.value
    const max = maxRaw === undefined ? undefined : Number(maxRaw)
    const datatype = objects(object.value, OWL + 'someValuesFrom')[0]
    const opmerking = objects(object.value, RDFS + 'comment')[0]?.value

    const label = LABELS[property]
    if (!label) {
      throw new Error(
        `Geen Nederlands label voor property "${property}" van ${klasse}. ` +
          'Voeg een label toe aan scripts/systeemvelden-config.mjs of sluit de property uit.',
      )
    }

    fields.push({
      property,
      label,
      verplicht: min >= 1,
      meervoudig: ENKELVOUDIG[property] ? false : max === undefined || max > 1,
      datatype: datatype ? curie(datatype.value) : 'xsd:string',
      opmerking: opmerking ?? null,
    })
  }

  return fields
}

const output = {}
for (const { sleutel, klasse } of SYSTEMEN) {
  output[sleutel] = restrictionsOf(klasse)
}

mkdirSync(dirname(OUT_PATH), { recursive: true })
writeFileSync(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`)
console.log('[build-systeemvelden] Geschreven →', OUT_PATH)

for (const { sleutel } of SYSTEMEN) {
  console.log(`  ${sleutel}: ${output[sleutel].map((field) => field.property).join(', ')}`)
}
