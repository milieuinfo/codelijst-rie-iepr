import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pocRoot = resolve(__dirname, '..')

const SRC_PATH = resolve(pocRoot, '../src/main/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld')
const DST_DIR = resolve(pocRoot, 'public/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr')
const DST_PATH = join(DST_DIR, 'rie-iepr.jsonld')

// Source file missing? Log warning and exit 0 — don't break dev/build.
if (!existsSync(SRC_PATH)) {
  console.warn('[sync-codelist] Warning: source file not found at', SRC_PATH)
  console.warn('[sync-codelist] Skipping sync — leaving existing destination untouched.')
  process.exit(0)
}

// Ensure destination directory exists.
mkdirSync(DST_DIR, { recursive: true })

copyFileSync(SRC_PATH, DST_PATH)
console.log('[sync-codelist] Synced rie-iepr.jsonld →', DST_PATH)
