import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { syncSchemaSnapshot } from '../../poc-json-schema/scripts/sync-schema-snapshot.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, '../poc-json-schema')
const resource = 'resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld'
try {
  syncSchemaSnapshot({
    schemaSource: join(source, 'output/schema'),
    codelistSource: join(source, 'public', resource),
    canonicalSource: resolve(root, '../../src/main', resource),
    inputDir: join(root, 'public'),
  })
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
