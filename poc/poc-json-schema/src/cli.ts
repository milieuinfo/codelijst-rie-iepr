import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const args = process.argv.slice(2)
  let themeFilter: string | undefined
  let outDir = path.resolve(__dirname, '../output')

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--theme' && args[i + 1]) {
      themeFilter = args[++i]
    } else if (args[i] === '--out' && args[i + 1]) {
      outDir = path.resolve(args[++i])
    }
  }

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
  const raw = JSON.parse(await fs.readFile(codelistPath, 'utf-8'))
  const result = parser.parseData(raw)
  console.log(`Parsed codelist: ${result.schemes.size} schemes, ${result.concepts.size} concepts`)

  // Step 2: Generate base schema
  const { BaseSchemaGenerator } = await import('./services/base-schema-generator.js')
  const baseGen = new BaseSchemaGenerator()
  const baseSchema = baseGen.generate()

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

  const { ConditionalValidatorGenerator } = await import('./services/conditional-validator.js')
  const conditionalGen = new ConditionalValidatorGenerator()

  const { SchemaAssembler } = await import('./services/schema-assembler.js')
  const assembler = new SchemaAssembler(baseSchema)

  const { SchemaWriter } = await import('./services/schema-writer.js')
  const writer = new SchemaWriter(outDir)

  // Step 5: Generate schemas per theme
  for (const [themeName, chain] of themes) {
    if (themeFilter && themeName !== themeFilter) continue

    console.log(`Generating schema for theme: ${themeName}`)

    // Compose fields from all schemes in the chain
    const fieldSet = composer.composeThemeFields(result, chain, mapper)

    // Build nested structure (composite grouping)
    const nestedFields = compositeBuilder.buildNestedStructure(fieldSet.fields)

    // Merge related sibling composites into single groups
    const mergedFields = compositeBuilder.mergeRelatedGroups(nestedFields)

    // Collect conditions from composed + nested fields
    const conditions = conditionalGen.collectConditions(mergedFields)
    const conditionBlock = conditionalGen.generateAllConditionals(conditions)

    // Assemble final domain schema
    const { domainSchema, subSchemas } = assembler.assemble(themeName, mergedFields, conditionBlock, chain, result)

    // Write output files
    await writer.writeBase(baseSchema)
    await writer.writeTheme(themeName, domainSchema)

    if (subSchemas) {
      for (const sub of subSchemas) {
        await writer.writeSubSchema(themeName, sub.name, sub.schema)
      }
    }
  }

  // Step 6: Validate all generated schemas
  const { SchemaValidator } = await import('./services/schema-validator.js')
  const validator = new SchemaValidator()
  const validationResults = await validator.validateAll(outDir)

  const failures = validationResults.filter((r: any) => !r.valid)
  if (failures.length > 0) {
    console.error(`Validation failed for ${failures.length} schema(s):`)
    for (const failure of failures) {
      console.error(`  ${failure.filePath}: ${failure.errors?.join(', ')}`)
    }
    process.exit(1)
  }

  console.log(`Validated ${validationResults.length} schema(s) successfully.`)
  console.log('Done. Generated schemas written to', outDir)
}

main().catch(err => {
  console.error('Error:', err.message)
  console.error(err.stack)
  process.exit(1)
})
