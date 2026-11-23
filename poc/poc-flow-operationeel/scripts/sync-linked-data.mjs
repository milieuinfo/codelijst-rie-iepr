import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const source = process.argv[2] ? pathToFileURL(resolve(process.argv[2]))
  : new URL('../../../../RIE-IEPR/src/main/resources/be/vlaanderen/omgeving/riepr/data/ns/riepr/riepr.ttl', import.meta.url)
const data = await readFile(source)
const cache = new URL('../.cache/linked-data/', import.meta.url)
const lock = JSON.parse(await readFile(new URL('../test/linked-data.lock.json', import.meta.url), 'utf8'))
const jar = new URL('ld-mcp-vocab.jar', cache)
const hash = data => createHash('sha256').update(data).digest('hex')
if (hash(await readFile(jar)) !== lock['ld-mcp-vocab.jar'].sha256) throw new Error('ld-mcp checksum mismatch.')
const generated = spawnSync('java', [
  '-jar', fileURLToPath(jar), 'generate-shapes', '--offline', '--ontologies', fileURLToPath(source),
], { encoding: 'utf8', timeout: 60_000, maxBuffer: 10 * 1024 * 1024 })
if (generated.error) throw generated.error
if (generated.status !== 0) throw new Error(generated.stderr || `Shape generation failed: ${generated.status}`)
const sourceName = 'RIE-IEPR/src/main/resources/be/vlaanderen/omgeving/riepr/data/ns/riepr/riepr.ttl'
const shapeData = generated.stdout.replaceAll(fileURLToPath(source), sourceName)
const directory = new URL('../test/fixtures/linked-data/', import.meta.url)
await mkdir(directory, { recursive: true })
await writeFile(new URL('riepr.ttl', directory), data)
await writeFile(new URL('riepr-shapes.ttl', directory), shapeData)
await writeFile(new URL('riepr-source.json', directory), JSON.stringify({
  source: sourceName,
  sha256: hash(data),
  shapesSha256: hash(shapeData),
  generator: 'ld-mcp-vocab 0.4.2 (RIE-IEPR restrictions only; imported vocabularies supply validation context)',
}, null, 2) + '\n')
console.log(`Synced validation ontology from ${source.pathname}`)
