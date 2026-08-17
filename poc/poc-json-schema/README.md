# Codelist RIE-IEPR → JSON Schema POC

Transformation tool that reads the RIE-IEPR SKOS/JSON-LD codelist (`rie-iepr.jsonld`) and generates **JSON Schema (Draft 2020-12)** documents for validating observation data reported through the RIE-IEPR framework.

## Architecture

```
┌──────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ rie-iepr     │───▶│ CodelistParser   │───▶│ ThemeResolver   │
│ .jsonld      │    │ (SKOS parsing)   │    │ (theme chains)  │
└──────────────┘    └──────────────────┘    └────────┬────────┘
                                                      │
                    ┌──────────────────┐              ▼
                    │ BaseSchemaGen    │    ┌──────────────────┐
                    │ (observatie.json)│    │ ChainComposer    │
                    └────────┬─────────┘    │ (merge scheme    │
                             │              │  fields per theme)│
                             │              └────────┬─────────┘
                             │                       │
                    ┌────────▼─────────┐    ┌────────▼─────────┐
                    │ ConceptMapper    │◀───│ CompositeGroup   │
                    │ (codelist →      │    │ Builder          │
                    │  SchemaField)    │    │ (broader/narrower)│
                    └────────┬─────────┘    └──────────────────┘
                             │
                    ┌────────▼─────────┐    ┌──────────────────┐
                    │ EnumGenerator    │    │ ConditionalVal.  │
                    │ (relevantCode→enum)│   │ (if/then blocks) │
                    └──────────────────┘    └──────────────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ SchemaAssembler  │──▶ output/schema/*.json
                    │ (final assembly) │
                    └──────────────────┘
```

## Quick Start

```bash
# Install dependencies
npm install

# Sync the codelist from upstream source
npm run predev

# Build the TypeScript project
npm run build

# Generate all schemas
npm run generate

# Generate a single theme
npm run generate -- --theme Lucht

# Custom output directory
npm run generate -- --out ./my-output
```

## Output Structure

```
output/schema/
├── observatie.json              # Base observation schema (SOSA OGC API)
├── grondstoffen/schema.json     # Grondstoffen domain
├── grondwater/schema.json       # Grondwater domain
├── lucht/schema.json            # Lucht domain
├── water/schema.json            # Water domain
├── zelfcontrole-lucht/schema.json
└── zelfcontrole-water/schema.json
```

Each generated file is valid JSON Schema Draft 2020-12. Domain schemas extend the base `observatie.json` via `$ref`.

## Transformation Pipeline

1. **CodelistParser** — Parses SKOS/JSON-LD into typed Concept/Scheme objects, handling compacted aliases and merged duplicates
2. **BaseSchemaGenerator** — Produces static base `observatie.json` with SOSA property definitions
3. **ThemeResolver** — Resolves `seeAlso` chains from thema concepts through operational schemes to leaf reporting schemes
4. **ConceptMapper** — Maps individual concepts to intermediate SchemaField representations (type mapping, enums, conditions, units)
5. **EnumGenerator** — Resolves `relevantCodeList` refs to enum values from local concept schemes
6. **ConditionalValidatorGenerator** — Converts `conditionPath`/`conditionValue` annotations to if/then blocks
7. **CompositeGroupBuilder** — Groups child concepts under parent composites using broader/narrower relationships; merges mutually `related` sibling composites (e.g. the four `bestemmingsidentificatie-*` variants) into a single nested object property with per-type conditional required
8. **ChainComposer** — Merges fields from all schemes in a theme's seeAlso chain
9. **SchemaAssembler** — Assembles final domain schemas with $ref composition
10. **SchemaWriter** — Writes pretty-printed JSON files to output directory

## Known Limitations

See [`docs/ISSUES.md`](./docs/ISSUES.md) for the full list of data-quality gaps that prevent semantically rich schema generation:

- No min/max/range constraints on numeric fields (`minValue`/`maxValue` columns absent from CSV source)
- 8 fields with unresolved unit references (`http://TODO`)
- 14 fields with unresolvable `relevantCodeList` refs (external domains, placeholders)
- No pattern/format validation rules beyond basic type mapping

The generated schemas are structurally correct but lack semantic validation depth by design — this POC demonstrates the transformation mechanism, not a complete production validator.

## Tech Stack

- Node.js + TypeScript (ESM, strict mode)
- JSON Schema Draft 2020-12
- No external dependencies at runtime
- Development: TypeScript, Vitest, AJV (for validation tests)
