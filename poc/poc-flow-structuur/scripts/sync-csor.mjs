/**
 * @file Generates `src/generated/csor.json`: the labels, definitions and unit
 * symbols of the CSOR concepts the RIE-IEPR eigenschappen refer to.
 *
 * The output always comes from the published GitHub sources; a local checkout
 * is never used:
 * - https://github.com/milieuinfo/codelijst-csor-eenheid
 * - https://github.com/milieuinfo/codelijst-csor-variabele
 *
 * Every run downloads the `.ttl` files again. The downloaded file is cached in
 * `.cache/csor/` and only serves as a fallback when GitHub is unreachable
 * (with `--offline` it is used without trying the network at all). Without
 * network ánd cache the script fails loudly, unless `--allow-stale` is passed
 * (used by `predev`/`prebuild`, which then keep the committed `csor.json`).
 *
 * Usage:
 *   node scripts/sync-csor.mjs               # download from GitHub (cache = offline fallback)
 *   node scripts/sync-csor.mjs --offline     # use the cache only
 *   node scripts/sync-csor.mjs --allow-stale # never fail; keep the existing file
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Parser } from 'n3'
import { readCsv } from './lib/csv.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pocRoot = resolve(__dirname, '..')
const repoRoot = resolve(pocRoot, '../..')
const sourceDir = resolve(repoRoot, 'src/source')
const cacheDir = resolve(pocRoot, '.cache/csor')
const outPath = resolve(pocRoot, 'src/generated/csor.json')

const args = new Set(process.argv.slice(2))
const offline = args.has('--offline')
const allowStale = args.has('--allow-stale')

/** The two CSOR codelists the eigenschappen refer to. */
const CSOR_LIJSTEN = {
  csor_eenheid: {
    bestand: 'eenheid.ttl',
    basis: 'https://data.omgeving.vlaanderen.be/id/concept/csor/eenheid/',
    repo: 'codelijst-csor-eenheid',
    pad: 'src/main/resources/be/vlaanderen/omgeving/data/id/conceptscheme/csor/eenheid/eenheid.ttl',
  },
  csor_variabele: {
    bestand: 'variabele.ttl',
    basis: 'https://data.omgeving.vlaanderen.be/id/concept/csor/variabele/',
    repo: 'codelijst-csor-variabele',
    pad: 'src/main/resources/be/vlaanderen/omgeving/data/id/conceptscheme/csor/variabele/variabele.ttl',
  },
}

const EIGENSCHAPPEN_FILES = [
  'emissiepunt_eigenschappen.csv',
  'filter_eigenschappen.csv',
  'installatie_eigenschappen.csv',
  'meetpunt_eigenschappen.csv',
  'uitwisselpunt_eigenschappen.csv',
  'onttrekkingspunt_eigenschappen.csv',
]

const RDFS = 'http://www.w3.org/2000/01/rdf-schema#'
const SKOS = 'http://www.w3.org/2004/02/skos/core#'
const CSOR = 'https://data.omgeving.vlaanderen.be/ns/csor#'
const OWL = 'http://www.w3.org/2002/07/owl#'

/**
 * Collects the CSOR ids the eigenschappen refer to, directly or as a member of
 * a `collectie:*` that a `relevantUnit`/`relevantCodeList` points at.
 * @returns {Set<string>} CSOR CURIEs, e.g. `csor_eenheid:E_59`.
 */
function collectCsorIds() {
  const collections = new Map()
  const refs = new Set()

  for (const file of EIGENSCHAPPEN_FILES) {
    const { rows } = readCsv(resolve(sourceDir, file))
    for (const row of rows) {
      if (row.collections && row._id) {
        if (!collections.has(row.collections)) collections.set(row.collections, [])
        collections.get(row.collections).push(row._id)
      }
      for (const column of ['relevantUnit', 'relevantCodeList']) {
        for (const ref of (row[column] ?? '').split(',').map((value) => value.trim()).filter(Boolean)) {
          refs.add(ref)
        }
      }
    }
  }

  const ids = new Set()
  for (const ref of refs) {
    if (ref.startsWith('collectie:')) {
      for (const member of collections.get(ref) ?? []) ids.add(member)
    } else if (ref.startsWith('csor_')) {
      ids.add(ref)
    }
  }
  return ids
}

/**
 * Reads one turtle file from the published GitHub source, storing it in the
 * cache. The cache is only a fallback for an unreachable GitHub (or the only
 * source with `--offline`); a local checkout is never used.
 * @param {object} lijst - Entry of `CSOR_LIJSTEN`.
 * @returns {Promise<string|null>} The turtle text, or null when no source is available.
 */
async function loadTurtle(lijst) {
  const cachePath = resolve(cacheDir, lijst.bestand)
  const url = `https://raw.githubusercontent.com/milieuinfo/${lijst.repo}/main/${lijst.pad}`

  if (!offline) {
    try {
      console.log(`[sync-csor] ${lijst.bestand} downloaden van ${url}`)
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const text = await response.text()
      mkdirSync(cacheDir, { recursive: true })
      writeFileSync(cachePath, text)
      return text
    } catch (error) {
      console.warn(`[sync-csor] Download mislukt (${error instanceof Error ? error.message : error})`)
    }
  }

  if (existsSync(cachePath)) {
    console.warn(`[sync-csor] ${lijst.bestand} uit cache (kopie van GitHub)`)
    return readFileSync(cachePath, 'utf8')
  }

  return null
}

/**
 * Picks the Dutch prefLabel, falling back to the untagged one.
 * @param {import('n3').Quad[]} quads - Quads of one subject.
 * @returns {string|undefined} The label.
 */
function prefLabel(quads) {
  const labels = quads
    .filter((quad) => quad.predicate.value === `${SKOS}prefLabel`)
    .map((quad) => ({ value: quad.object.value, taal: quad.object.language }))
  return (labels.find((label) => label.taal === 'nl') ?? labels[0])?.value
}

/**
 * Converts the quads of one subject to the generated record.
 * @param {import('n3').Quad[]} quads - Quads of one subject.
 * @returns {object} The record for `csor.json`.
 */
function toRecord(quads) {
  const first = (predicate) => quads.find((quad) => quad.predicate.value === `${predicate}`)?.object.value
  const record = {}
  const label = prefLabel(quads)
  if (label) record.label = label
  const definition = first(`${SKOS}definition`)
  if (definition) record.definition = definition
  const symbol = first(`${CSOR}symbool`)
  if (symbol) record.symbol = symbol
  const notation = first(`${SKOS}notation`)
  if (notation) record.notation = notation
  const deprecated = first(`${OWL}deprecated`)
  if (deprecated !== undefined) record.deprecated = deprecated === 'true'
  return record
}

async function main() {
  const needed = collectCsorIds()

  /** @type {Record<string, object>} */
  const result = {}
  const missing = []

  for (const [prefix, lijst] of Object.entries(CSOR_LIJSTEN)) {
    const wanted = [...needed].filter((id) => id.startsWith(`${prefix}:`))
    if (wanted.length === 0) continue

    const turtle = await loadTurtle(lijst)
    if (!turtle) {
      if (allowStale && existsSync(outPath)) {
        console.warn(`[sync-csor] Geen bron voor ${lijst.bestand}; bestaande csor.json blijft behouden.`)
        return
      }
      console.error(`[sync-csor] Geen bron voor ${lijst.bestand} (GitHub onbereikbaar en geen cache).`)
      process.exit(1)
    }

    const quads = new Parser().parse(turtle)
    const bySubject = new Map()
    for (const quad of quads) {
      if (quad.predicate.value.startsWith(SKOS) || quad.predicate.value === `${CSOR}symbool`) {
        if (!bySubject.has(quad.subject.value)) bySubject.set(quad.subject.value, [])
        bySubject.get(quad.subject.value).push(quad)
      }
    }

    for (const id of wanted) {
      const quadsOfId = bySubject.get(lijst.basis + id.slice(prefix.length + 1))
      if (!quadsOfId) {
        missing.push(id)
        continue
      }
      result[id] = toRecord(quadsOfId)
    }
  }

  const sorted = Object.fromEntries(Object.keys(result).sort().map((id) => [id, result[id]]))
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, `${JSON.stringify(sorted, null, 2)}\n`)

  console.log(`[sync-csor] ${Object.keys(sorted).length} CSOR-concepten geschreven → ${outPath}`)
  if (missing.length > 0) {
    console.warn(`[sync-csor] Niet gevonden in de CSOR-bronnen (${missing.length}): ${missing.join(', ')}`)
    console.warn('[sync-csor] Meld dit aan het datateam; de UI toont voorlopig de lokale naam.')
  }
}

await main()
