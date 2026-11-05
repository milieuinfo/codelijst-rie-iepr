import { compileTabularPlan, ODSImporter, readOdf, workbookMetadata } from 'codelijst-rie-iepr-poc-json-schema-ods/browser'
import { type JsonSchemaObject, type ReferenceRecord } from 'codelijst-rie-iepr-poc-json-schema/browser'
import { SchemaEditor, isObject } from './schema-editor.js'

export async function uploadOds(
  input: Uint8Array,
  options: {
    schema: JsonSchemaObject; dependencies: JsonSchemaObject[]
    sourceSha256: string; schemaSha256: string; year: number; references: ReferenceRecord[]
  },
): Promise<SchemaEditor> {
  const plan = compileTabularPlan(options.schema, options)
  const data = await new ODSImporter().import(input, plan, { referenceContext: { year: options.year } })
  const tables = await readOdf(input)
  const table = tables.find(table => table.rows.find(row => row.number === 1)?.cells[0]?.text === '@metadata:v2')
  if (!table) throw new Error('De ODS bevat geen geldige rapportagemetadata.')
  const metadata = workbookMetadata(JSON.parse(table.rows.filter(row => row.number > 1)
    .map(row => row.cells[0]?.text ?? '').join('')))
  if (metadata.referenceContext?.year !== undefined && metadata.referenceContext.year !== options.year) {
    throw new Error(`De ODS hoort bij productiejaar ${metadata.referenceContext.year}, niet ${options.year}.`)
  }
  if (!isObject(data)) throw new Error('De ODS bevat geen rapportageobject.')
  const references = new Map(options.references.map(reference => [reference.id, reference]))
  for (const reference of metadata.references) references.set(reference.id, reference)
  const editor = new SchemaEditor(options.schema, options.dependencies, [...references.values()], { year: options.year })
  editor.load(data)
  const result = editor.validate()
  if (result.diagnostics.length) {
    throw new Error(result.diagnostics.map(error => `${error.instancePath || '/'}: ${error.message}`).join('\n'))
  }
  return editor
}
