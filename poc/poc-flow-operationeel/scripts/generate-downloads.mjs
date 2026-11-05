import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { schemaObject } from '../../poc-json-schema/dist/index.js'
import { loadSchemaIndex } from '../../poc-json-schema-ods/dist/services/schema-index.js'
import { compileTabularPlan } from '../../poc-json-schema-ods/dist/services/tabular-plan.js'
import { ODSGenerator } from '../../poc-json-schema-ods/dist/services/ods-generator.js'
import { CodelistEnricher } from '../../poc-json-schema-ods/dist/services/codelist-enricher.js'
import { referenceData } from '../../poc-json-schema-ods/dist/services/workbook-metadata.js'
import { generationFixture } from '../../poc-json-schema-ods/dist/services/generation-fixture.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

try {
  const input = join(root, 'public')
  const index = loadSchemaIndex(input)
  const source = await readFile(join(input, 'codelist.jsonld'), 'utf8')
  const documents = new Map(await Promise.all(index.files.map(async entry => {
    const content = await readFile(join(input, 'schema', entry.path), 'utf8')
    return [entry.id, schemaObject(JSON.parse(content))]
  })))
  const labels = new CodelistEnricher(join(input, 'codelist.jsonld'))
  const csor = JSON.parse(await readFile(join(root, 'src/generated/csor.json'), 'utf8'))
  const prefixes = JSON.parse(source)['@context']
  labels.addExternalLabels(Object.entries(csor).map(([id, value]) => {
    const [prefix, local] = id.split(':')
    const base = prefixes[prefix]
    if (typeof base !== 'string') throw new Error(`Unknown CSOR prefix ${prefix}.`)
    return { uri: base + local, prefLabel: value.label, symbol: value.symbol }
  }))
  const references = referenceData(JSON.parse(await readFile(
    join(root, '../poc-json-schema/examples/refs.json'), 'utf8')))
  for (const entry of index.files.filter(entry => entry.kind === 'section')) {
    const schema = documents.get(entry.id)
    const filename = schema['x-table-workbook']
    if (filename === undefined) continue
    if (typeof filename !== 'string' || !/^[^/\\]+\.ods$/.test(filename)) {
      throw new Error(`Invalid workbook filename for ${entry.id}.`)
    }
    const plan = compileTabularPlan(schema, {
      sourceSha256: index.sourceSha256, schemaSha256: entry.sha256,
      dependencies: [...documents.values()],
    })
    const workbook = await new ODSGenerator().generate({
      plan, references, label: value => labels.resolve(value).displayLabel,
      validationData: await generationFixture(plan),
    })
    const output = join(input, 'templates', posix.dirname(entry.path), filename)
    await mkdir(dirname(output), { recursive: true })
    await writeFile(output, workbook)
    console.log(`Download template: ${posix.join(posix.dirname(entry.path), filename)}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
