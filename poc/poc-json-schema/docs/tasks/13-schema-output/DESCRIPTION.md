# Task 13 — Schema Output Assembly and File Writing

Build the final assembly layer that takes all intermediate representations (base schema, per-theme
field sets, conditional blocks, composite structures) and produces complete JSON Schema files
written to disk in the expected output directory structure.

This task also implements the CLI entry point (`src/cli.ts`) that orchestrates the full pipeline
from codelist parsing through file generation.

## Scope

### Class: `SchemaAssembler` (`src/services/schema-assembler.ts`)

```typescript
export interface AssembledOutput {
  /** Base observatie.json content ready for serialization. */
  baseSchema: JsonSchemaObject
  /** Per-theme domain schemas keyed by theme name slug. */
  domainSchemas: Map<string, JsonSchemaObject>
}

export class SchemaAssembler {
  /**
   * Assemble the complete set of JSON Schemas from parsed codelist data.
   * @param result - Parsed codelist from CodelistParser
   * @param options - Generation options (which themes, output paths, etc.)
   * @returns Assembled output with base + domain schemas
   */
  assemble(result: CodelistResult, options?: GenerateOptions): AssembledOutput
}

export interface GenerateOptions {
  /** Theme names to generate (default: all). */
  themes?: string[]
  /** Output directory path (default: './output'). */
  outDir?: string
  /** Whether to validate generated schemas against meta-schema. */
  validate?: boolean
}
```

### Assembly Logic

For each theme, build a complete Draft 2020-12 schema object:

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://data.riepr.omgeving.vlaanderen.be/schema/2026/observatie/<theme>/schema.json",
  "description": "RIE-IEPR observatie voor <theme label>",
  "type": "object",
  // Required fields at the top level of the observation envelope
  "required": ["resultTime", "observedProperty", "hasFeatureOfInterest", "hasResult"],
  "properties": {
    // Reference base schema properties via $ref
    "resultTime": { "$ref": "../observatie.json#/properties/resultTime" },
    "wasOriginatedBy": { "$ref": "../observatie.json#/properties/wasOriginatedBy" },
    // Domain-specific constraints on hasFeatureOfInterest and observedProperty
    "hasFeatureOfInterest": { /* type + allOf with base ref */ },
    "observedProperty": { /* type + enum from scheme concepts + allOf with base ref */ },
    // Domain-specific result constraints
    "hasResult": { /* allOf with base ref + unit enums */ }
  },
  "allOf": [
    // Extend base observation schema
    { "$ref": "../observatie.json" },
    // Conditional if/then blocks for conditionPath/conditionValue rules
    { "if": { ... }, "then": { ... } },
    // Additional domain-specific validation rules
  ]
}
```

#### Property Assembly Steps

1. **Inherit base properties**: Add `$ref` entries for `resultTime`, `wasOriginatedBy` pointing to
   the base observatie schema's property definitions.

2. **Extend constrained properties**: For `observedProperty`, `hasFeatureOfInterest`, and
   `hasResult`, use `allOf` to combine:
   - A `$ref` to the base definition
   - Local overrides (type, enum, nested constraints) specific to this theme

3. **Add domain fields**: Merge all composed fields from Task 12 as additional top-level properties.
   These are the operationeel form fields that capture the actual reported data.

4. **Build required array**: Collect all field names where `isRequired = true`. Always include the
   core observation envelope fields (`resultTime`, `observedProperty`, `hasFeatureOfInterest`,
   `hasResult`).

5. **Append conditional blocks**: Generate if/then blocks from Task 08 and append them to the
   `allOf` array after the base `$ref` entry.

6. **Set $id and description**: Use the theme name slug in the `$id` path and Dutch label in
   `description`. Theme slugs map as follows:
   - Grondstoffen → `grondstoffen`
   - Grondwater → `grondwater`
   - Lucht → `lucht`
   - Water → `water`
   - Zelfcontrole lucht → `zelfcontrole-lucht`
   - Zelfcontrole water → `zelfcontrole-water`

### File Writing (`src/services/schema-writer.ts`)

```typescript
export class SchemaWriter {
  /**
   * Write assembled schemas to disk.
   * @param output - Assembled schema content
   * @param outDir - Output directory path
   */
  write(output: AssembledOutput, outDir: string): void
}
```

- Creates subdirectories per theme under `<outDir>/schema/<theme>/`
- Writes `observatie.json` at `<outDir>/schema/observatie.json`
- Writes each domain schema as `<outDir>/schema/<theme>/schema.json`
- Pretty-prints JSON with 2-space indentation
- Creates parent directories recursively if they don't exist

### CLI Entry Point (`src/cli.ts`)

```typescript
#!/usr/bin/env node
// Usage: node dist/cli.js [--theme <name>] [--out <dir>]

import { CodelistParser } from './services/codelist-parser.js'
import { BaseSchemaGenerator } from './services/base-schema-generator.js'
import { ThemeResolver } from './services/theme-resolver.js'
import { ConceptMapper } from './services/concept-mapper.js'
import { ChainComposer } from './services/chain-composer.js'
import { ConditionalValidatorGenerator } from './services/conditional-validator.js'
import { SchemaAssembler } from './services/schema-assembler.js'
import { SchemaWriter } from './services/schema-writer.js'

async function main() {
  const args = parseArgs(process.argv)
  const parser = new CodelistParser()
  const result = parser.loadFromFile('public/resources/.../rie-iepr.jsonld')

  console.log(`Loaded codelist: ${result.schemes.size} schemes, ${result.concepts.size} concepts`)

  // Generate base schema
  const baseGen = new BaseSchemaGenerator()
  const baseSchema = baseGen.generate()

  // Resolve themes and generate domain schemas
  const resolver = new ThemeResolver()
  const mapper = new ConceptMapper()
  const composer = new ChainComposer()
  const conditionalGen = new ConditionalValidatorGenerator()
  const assembler = new SchemaAssembler()

  const output = assembler.assemble(result, {
    themes: args.theme ? [args.theme] : undefined,
    outDir: args.out || 'output',
  })

  // Write to disk
  const writer = new SchemaWriter()
  writer.write(output, args.out || 'output')

  console.log(`Generated schemas in ${args.out || 'output}/schema/`)
}

main().catch(err => { console.error(err); process.exit(1) })
```

### Unit Tests (`src/services/schema-assembler.test.ts`, `src/services/schema-writer.test.ts`)

```typescript
describe('SchemaAssembler', () => {
  it('produces valid Draft 2020-12 schema for each theme', () => { ... })
  it('includes $ref to base observatie.json in allOf', () => { ... })
  it('sets correct $id path per theme slug', () => { ... })
  it('includes required array with core envelope fields', () => { ... })
  it('appends if/then conditionals from conditional validator', () => { ... })
  it('generates only requested themes when --theme flag is used', () => { ... })
})

describe('SchemaWriter', () => {
  it('writes observatie.json at the correct path', () => { ... })
  it('writes domain schemas under theme subdirectories', () => { ... })
  it('creates parent directories recursively', () => { ... })
  it('pretty-prints JSON with 2-space indentation', () => { ... })
})
```

## Deliverables

1. `src/services/schema-assembler.ts` — Full assembly logic combining all pipeline stages
2. `src/services/schema-writer.ts` — File writing with directory creation
3. `src/cli.ts` — CLI entry point orchestrating the full pipeline
4. Unit tests for assembler and writer
5. Running `npm run build && node dist/cli.js` produces valid output files

## Definition of Done

- All unit tests pass
- `node dist/cli.js` generates complete schema files in `output/schema/` matching the expected structure:
  ```
  output/schema/observatie.json
  output/schema/grondstoffen/schema.json
  output/schema/grondwater/schema.json
  output/schema/lucht/schema.json
  output/schema/water/schema.json
  output/schema/zelfcontrole-lucht/schema.json
  output/schema/zelfcontrole-water/schema.json
  ```
- Each generated file is valid Draft 2020-12 JSON Schema (verifiable via ajv)
- Base observatie.json matches the semantic content of `docs/archive/observatie.json`
- Domain schemas follow the composition pattern from `docs/archive/lucht/schema.json`
- Theme name slugs match the mapping table exactly
- `--theme <name>` flag filters to a single theme's generation
- `--out <dir>` flag customizes output directory
- Pretty-printed JSON with consistent 2-space indentation
