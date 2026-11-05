import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { sourceSnapshot } from './source-snapshot.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pocRoot = resolve(__dirname, '..')
const repoRoot = resolve(pocRoot, '../..')

const SRC_PATH = resolve(repoRoot, 'src/main/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld')
const DST_DIR = resolve(pocRoot, 'public/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr')
const DST_PATH = join(DST_DIR, 'rie-iepr.jsonld')

export function syncCodelist(source = SRC_PATH, destination = DST_PATH) {
  if (!existsSync(source)) {
    throw new Error(`Codelist source not found: ${source}. Generate SKOS before syncing; stale copies cannot be used.`)
  }
  mkdirSync(dirname(destination), { recursive: true })
  writeFileSync(destination, sourceSnapshot(source))
  console.log('[sync-codelist] Synced rie-iepr.jsonld →', destination)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    syncCodelist()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
