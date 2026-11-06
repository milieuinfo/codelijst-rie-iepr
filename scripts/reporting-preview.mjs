import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { loadReportingEntries } from './reporting-entries.mjs'
import { loadPublishedLabels } from './published-labels.mjs'

const runtimeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function ensureBuild(directory, dependencies = []) {
  const newest = path => statSync(path).isDirectory()
    ? Math.max(...readdirSync(path).map(name => newest(join(path, name))))
    : statSync(path).mtimeMs
  const output = join(directory, 'dist/index.js')
  const inputs = ['src', 'package.json', 'tsconfig.json', ...dependencies].map(path => resolve(directory, path))
  if (existsSync(output) && statSync(output).mtimeMs >= Math.max(...inputs.map(newest))) return
  try {
    execFileSync('npm', ['run', 'build'], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    throw new Error(`Reporting compiler build failed in ${directory}. Install its declared dependencies if missing.\n${error.stdout ?? ''}${error.stderr ?? error.message}`)
  }
}

export async function reportingPreview({ root = runtimeRoot, flow, section } = {}) {
  const schemaDirectory = join(runtimeRoot, 'poc/poc-json-schema')
  const odsDirectory = join(runtimeRoot, 'poc/poc-json-schema-ods')
  ensureBuild(schemaDirectory)
  ensureBuild(odsDirectory, ['../poc-json-schema/dist'])
  const { sourceSnapshot } = await import('../poc/poc-json-schema/scripts/source-snapshot.mjs')
  const { CodelistParser, ThemeResolver, ChainComposer, ConceptMapper, CompositeGroupBuilder, SchemaAssembler, SchemaValidator } =
    await import('../poc/poc-json-schema/dist/services/index.js')
  const { SourceMetadataError } = await import('../poc/poc-json-schema/dist/services/generation-report.js')
  const { compileTabularPlan } = await import('../poc/poc-json-schema-ods/dist/services/tabular-plan.js')
  const { inputColumns, parentKeyComponents, parentColumn, parentTitle, layoutColumns } =
    await import('../poc/poc-json-schema-ods/dist/services/workbook-layout.js')
  const { ODSGenerator } = await import('../poc/poc-json-schema-ods/dist/services/ods-generator.js')
  const { parseReferenceData, parseReferenceContext } = await import('../poc/poc-json-schema/dist/services/reference-schema.js')
  const configured = loadReportingEntries(root)
  const entry = flow === undefined ? undefined : configured.find(entry =>
    [entry.schemeId, entry.slug, entry.label].some(value => value.toLowerCase() === flow.trim().toLowerCase()))
  if (flow !== undefined && !entry) throw new Error(`No declared reporting entry matches ${flow}.`)
  if (section !== undefined && !entry) throw new Error('Select one reporting entry when filtering a section.')
  const publication = join(root, 'src/main/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld')
  const source = sourceSnapshot(publication, undefined, root)
  const sourceSha256 = createHash('sha256').update(source).digest('hex')
  const result = new CodelistParser().parseData(JSON.parse(source))
  const publishedLabels = loadPublishedLabels(root)
  const labels = new Map(Object.entries(publishedLabels.concepts).map(([id, value]) => [result.expandCurie(id), value]))
  const themes = new ThemeResolver().resolveAllThemes(result)
  const composer = new ChainComposer()
  const mapper = new ConceptMapper(result)
  const references = parseReferenceData(JSON.parse(readFileSync(join(root, 'poc/poc-json-schema/examples/refs.json'), 'utf8')))
  const referenceContext = parseReferenceContext(JSON.parse(readFileSync(join(root, 'poc/poc-json-schema/examples/reference-context.json'), 'utf8')))
  const sections = []
  for (const [theme, chain] of themes) {
    if (entry && entry.label !== theme) continue
    const candidates = composer.getReportingSections(result, chain)
    const selected = section === undefined ? candidates : candidates.filter(candidate =>
      [candidate.id, result.expandCurie(candidate.id), candidate.prefLabel].some(value => value === section))
    if (!selected.length) throw new Error(`No reporting section matches ${section ?? theme}.`)
    for (const candidate of selected) {
      const current = {
        theme, conceptId: result.expandCurie(candidate.id), label: candidate.prefLabel,
        ready: false, stage: 'schema', issues: [], sheets: [],
        checks: { schema: false, tabular: false, blankTemplate: false, populatedRoundTrip: false },
      }
      sections.push(current)
      let schema
      try {
        const fields = composer.composeThemeFields(result, chain, mapper, candidate.id).fields
        const assembled = new SchemaAssembler({}).assemble(theme,
          new CompositeGroupBuilder(result, mapper).buildNestedStructure(fields), null, chain, result)
        schema = assembled.subSchemas.find(schema => schema.schema['x-section-concept'] === current.conceptId)?.schema
        if (!schema) throw new Error(`No generated section for ${candidate.id}.`)
        new SchemaValidator().validateInstance(schema, {})
        current.checks.schema = true
      } catch (error) {
        if (!(error instanceof SourceMetadataError)) throw error
        current.issues = error.issues
        continue
      }
      current.stage = 'tabular'
      try {
        if (typeof schema['x-table-workbook'] !== 'string') {
          throw new Error(`${candidate.id}: missing _table_workbook for a downloadable business template.`)
        }
        current.workbook = schema['x-table-workbook']
        const plan = compileTabularPlan(schema, { sourceSha256 })
        current.sheets = plan.records.filter(record => record.id !== 'root').map(record => {
          const columns = inputColumns(record).map(column => ({
            id: column.id, label: column.title, path: column.path, required: column.required,
            sourceConcept: column.schema['x-source-concept'], type: column.schema.type,
            minimum: column.schema.minimum, maximum: column.schema.maximum,
            choices: column.schema.enum, fixedValue: column.schema.const,
            choiceLabels: column.schema.enum?.map(value => ({ value, ...labels.get(value) })),
            fixedValueLabel: labels.get(column.schema.const),
          }))
          columns.push(...parentKeyComponents(plan, record).map(component => ({
            id: component.id, label: component.column.title, parentKey: component.sourceConcept,
          })))
          if (parentColumn(plan, record)) columns.push({ id: '_parent_ref', label: parentTitle(plan, record), parentReference: true })
          return {
            name: record.sheetName, path: record.path,
            columns: layoutColumns(plan, record).map(id => columns.find(column => column.id === id)),
          }
        })
        current.checks.tabular = true
        current.stage = 'template'
        await new ODSGenerator().generate({ plan, references, referenceContext })
        current.checks.blankTemplate = true
        current.ready = true
        current.stage = 'ready'
      } catch (error) {
        current.issues = [{ message: error.message, conceptId: current.conceptId }]
      }
    }
  }
  return {
    complete: sections.length > 0 && sections.every(section => section.ready), sourceSha256, sections,
    publishedLabels: { available: publishedLabels.available, source: publishedLabels.source },
    note: 'Read-only preview from current CSVs using the actual schema and ODS compilers. A blank template was generated in memory; populated round-trips and business completeness are not certified.',
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [root, flow, section] = process.argv.slice(2)
    process.stdout.write(JSON.stringify(await reportingPreview({ root, flow, section })))
  } catch (error) {
    console.error(error.stack ?? error.message)
    process.exitCode = 1
  }
}
