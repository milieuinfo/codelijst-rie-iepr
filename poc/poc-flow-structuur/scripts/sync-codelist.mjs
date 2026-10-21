import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readCsv } from './lib/csv.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pocRoot = resolve(__dirname, '..')
const repoRoot = resolve(pocRoot, '../..')
const sourceDir = resolve(repoRoot, 'src/source')

const SRC_PATH = resolve(
  repoRoot,
  'src/main/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld',
)
const DST_DIR = resolve(pocRoot, 'public/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr')
const DST_PATH = join(DST_DIR, 'rie-iepr.jsonld')
const ORDER_PATH = resolve(pocRoot, 'src/generated/csv-volgorde.json')

/** The source CSV's that define the systeemtypes and systeemeigenschappen. */
const SOURCE_FILES = [
  'emissiepunt_type.csv',
  'emissiepunt_eigenschappen.csv',
  'filter_type.csv',
  'filter_eigenschappen.csv',
  'installatie_type.csv',
  'installatie_eigenschappen.csv',
  'meetpunt_type.csv',
  'meetpunt_eigenschappen.csv',
  'uitwisselpunt_type.csv',
  'uitwisselpunt_eigenschappen.csv',
  'onttrekkingspunt_type.csv',
  'onttrekkingspunt_eigenschappen.csv',
]

/**
 * Reads the CSV order of every conceptscheme (`inScheme`, falling back to
 * `topConceptOf`) and of every collection (`collections`).
 *
 * The generated JSON-LD sorts its nodes and `hasTopConcept` lists
 * alphabetically; the CSV order is the editorial order (and the order the
 * composite children appear in). The POC uses this file to render fields in
 * source order without parsing CSV in the browser.
 * @returns {{ schemes: Record<string, string[]>, collections: Record<string, string[]> }}
 */
function buildOrder() {
  /** @type {Record<string, string[]>} */
  const schemes = {}
  /** @type {Record<string, string[]>} */
  const collections = {}

  const push = (map, key, id) => {
    if (!key || !id) return
    map[key] ??= []
    if (!map[key].includes(id)) map[key].push(id)
  }

  for (const file of SOURCE_FILES) {
    const path = resolve(sourceDir, file)
    if (!existsSync(path)) {
      console.warn('[sync-codelist] Waarschuwing: bronbestand niet gevonden:', path)
      continue
    }

    const { rows } = readCsv(path)
    for (const row of rows) {
      const id = row._id
      if (!id) continue
      const scheme = row.inScheme || row.topConceptOf
      push(schemes, scheme, id)
      push(collections, row.collections, id)
    }
  }

  return { schemes, collections }
}

// Source file missing? Log warning and exit 0 — don't break dev/build.
if (!existsSync(SRC_PATH)) {
  console.warn('[sync-codelist] Waarschuwing: bronbestand niet gevonden op', SRC_PATH)
  console.warn('[sync-codelist] Sync overgeslagen — bestaand doelbestand blijft ongewijzigd.')
} else {
  mkdirSync(DST_DIR, { recursive: true })
  copyFileSync(SRC_PATH, DST_PATH)
  console.log('[sync-codelist] rie-iepr.jsonld gesynchroniseerd →', DST_PATH)
}

const order = buildOrder()
mkdirSync(dirname(ORDER_PATH), { recursive: true })
writeFileSync(ORDER_PATH, `${JSON.stringify(order, null, 2)}\n`)
console.log('[sync-codelist] CSV-volgorde geschreven →', ORDER_PATH)
