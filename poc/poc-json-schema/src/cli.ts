import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sha256 } from './services/schema-writer.js'
import { SourceMetadataError, generationWarning, type GenerationReport } from './services/generation-report.js'
import type { ThemeChain } from './services/theme-resolver.js'
import type { JsonSchemaObject, SubSchema } from './models/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const args = process.argv.slice(2)
  let themeFilter: string | undefined
  let sectionFilter: string | undefined
  let allowIncomplete = false
  let outDir = path.resolve(__dirname, '../output')

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--theme' && args[i + 1] && !args[i + 1].startsWith('--')) {
      themeFilter = args[++i]
    } else if (args[i] === '--section' && args[i + 1] && !args[i + 1].startsWith('--')) {
      sectionFilter = args[++i]
    } else if (args[i] === '--out' && args[i + 1] && !args[i + 1].startsWith('--')) {
      outDir = path.resolve(args[++i])
    } else if (args[i] === '--allow-incomplete') {
      allowIncomplete = true
    } else throw new Error(`Unknown option or missing value: ${args[i]}`)
  }
  if (sectionFilter && !themeFilter) throw new Error('--section requires --theme to select an explicit reporting entry point.')

  const codelistPath = path.resolve(__dirname, '../public/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld')

  try {
    await fs.access(codelistPath)
  } catch {
    console.error(`Error: Codelist file not found at ${codelistPath}`)
    console.error('Run `npm run predev` to sync the codelist first.')
    process.exit(1)
  }

  // Step 1: Parse codelist
  const { CodelistParser } = await import('./services/codelist-parser.js')
  const parser = new CodelistParser()
  const codelistContent = await fs.readFile(codelistPath, 'utf-8')
  const sourceSha256 = sha256(codelistContent)
  const { sourceSnapshot } = await import('../scripts/source-snapshot.mjs')
  if (sourceSha256 !== sha256(sourceSnapshot())) {
    throw new Error('Stale codelist input. Run `npm run predev` before generating schemas.')
  }
  const raw = JSON.parse(codelistContent)
  const result = parser.parseData(raw)
  console.log(`Parsed codelist: ${result.schemes.size} schemes, ${result.concepts.size} concepts`)

  // Step 2: Generate base schema
  const { BaseSchemaGenerator } = await import('./services/base-schema-generator.js')
  const baseGen = new BaseSchemaGenerator()
  const baseSchema = baseGen.generate()
  const collectionSchema = baseGen.generateCollection()

  // Step 3: Resolve themes
  const { ThemeResolver } = await import('./services/theme-resolver.js')
  const themeResolver = new ThemeResolver()
  const themes = themeResolver.resolveAllThemes(result)
  console.log(`Resolved ${themes.size} themes`)

  if (themeFilter && !themes.has(themeFilter)) {
    console.error(`Error: Theme "${themeFilter}" not found.`)
    console.error('Available themes:', Array.from(themes.keys()).join(', '))
    process.exit(1)
  }

  // Step 4: Create mapper and composite builder
  const { ConceptMapper } = await import('./services/concept-mapper.js')
  const mapper = new ConceptMapper(result)

  const { CompositeGroupBuilder } = await import('./services/composite-group-builder.js')
  const compositeBuilder = new CompositeGroupBuilder(result, mapper)

  const { ChainComposer } = await import('./services/chain-composer.js')
  const composer = new ChainComposer()

  const { SchemaAssembler } = await import('./services/schema-assembler.js')
  const assembler = new SchemaAssembler(baseSchema)

  const { SchemaWriter } = await import('./services/schema-writer.js')
  const writer = new SchemaWriter(outDir)
  const pending: { schema: JsonSchemaObject; publish: () => Promise<void> }[] = [
    { schema: baseSchema, publish: () => writer.writeBase(baseSchema) },
    { schema: collectionSchema, publish: () => writer.writeCollection(collectionSchema) },
  ]
  const report: GenerationReport = {
    mode: allowIncomplete ? 'allow-incomplete' : 'strict',
    complete: true,
    ...(themeFilter ? { theme: themeFilter } : {}),
    ...(sectionFilter ? { sectionConceptId: result.expandCurie?.(sectionFilter) ?? sectionFilter } : {}),
    blockedSections: [],
  }
  let sectionCount = 0

  const compile = (theme: string, chain: ThemeChain, section?: string) => {
    const fields = composer.composeThemeFields(result, chain, mapper, section).fields
    return assembler.assemble(theme, compositeBuilder.buildNestedStructure(fields), null, chain, result)
  }
  const stageSection = (section: SubSchema, theme: string, themeConceptId: string) => {
    pending.push({ schema: section.schema, publish: () => writer.writeSubSchema(theme, section.name, section.schema, themeConceptId) })
    sectionCount++
  }

  // Compile before writing so source/schema errors cannot replace an existing snapshot.
  for (const [themeName, chain] of themes) {
    if (themeFilter && themeName !== themeFilter) continue
    console.log(`Generating schema for theme: ${themeName}`)
    const themeConceptId = result.expandCurie?.(chain.themeConcept.id) ?? chain.themeConcept.id
    if (!allowIncomplete) {
      const { domainSchema, subSchemas } = compile(themeName, chain, sectionFilter)
      const themeSlug = domainSchema['x-theme-slug']
      if (typeof themeSlug !== 'string') throw new Error(`Missing generated theme identity: ${themeName}`)
      pending.push({ schema: domainSchema, publish: () => writer.writeTheme(themeSlug, domainSchema, themeConceptId) })
      for (const sub of subSchemas) {
        stageSection(sub, themeSlug, themeConceptId)
      }
      continue
    }

    const sections = sectionFilter ? [sectionFilter] : composer.getReportingSections(result, chain).map(section => section.id)
    if (!sections.length) throw new Error(`No reachable reporting sections found for ${themeName}.`)
    for (const sectionId of sections) {
      const sectionConceptId = result.expandCurie?.(sectionId) ?? sectionId
      try {
        const { subSchemas } = compile(themeName, chain, sectionId)
        const section = subSchemas.find(sub => sub.schema['x-section-concept'] === sectionConceptId)
        if (!section) throw new Error(`No generated schema for reporting section ${sectionId}.`)
        const themeSlug = section.schema['x-theme-slug']
        if (typeof themeSlug !== 'string') throw new Error(`Missing generated theme identity: ${themeName}`)
        stageSection(section, themeSlug, themeConceptId)
      } catch (error) {
        if (!(error instanceof SourceMetadataError)) throw error
        const sectionLabel = result.concepts.get(sectionId)?.prefLabel ??
          [...result.concepts.values()].find(concept => result.expandCurie?.(concept.id) === sectionConceptId)?.prefLabel ?? sectionId
        report.blockedSections.push({
          theme: themeName, themeConceptId, sectionConceptId, sectionLabel,
          issues: error.issues.map(issue => ({
            ...issue, conceptId: result.expandCurie?.(issue.conceptId) ?? issue.conceptId,
          })),
        })
        console.warn(`Blocked ${themeName} / ${sectionLabel} (${sectionId}):\n${error.message}`)
      }
    }
  }

  report.complete = report.blockedSections.length === 0
  if (allowIncomplete && !sectionCount) throw new Error('No usable reporting sections; no schema index was published.')

  const { SchemaValidator } = await import('./services/schema-validator.js')
  const validator = new SchemaValidator()
  const generated = pending.map(document => document.schema)
  if (new Set(generated.map(schema => schema.$id)).size !== generated.length) throw new Error('Duplicate generated schema identities.')
  for (const schema of generated) validator.validateInstance(schema, {}, generated)
  for (const document of pending) await document.publish()

  await writer.finalize(sourceSha256, report)
  const warning = generationWarning(report)
  if (warning) console.warn(warning)
  console.log(`Validated ${generated.length} schema(s); generated ${sectionCount} reporting section(s).`)
  console.log('Done. Generated schemas written to', outDir)
}

main().catch(err => {
  console.error('Error:', err.message)
  console.error(err.stack)
  process.exit(1)
})
