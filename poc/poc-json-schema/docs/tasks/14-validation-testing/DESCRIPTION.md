# Task 14 — Validation, Verification, and Cleanup

Validate all generated JSON Schemas against the Draft 2020-12 meta-schema using AJV. Create test
fixtures with sample data that exercises each schema's structural rules. Document any remaining
gaps in ISSUES.md. Perform final cleanup and verification.

## Scope

### AJV Schema Validation (`src/services/schema-validator.ts`)

```typescript
export interface ValidationResult {
  /** Whether the schema is valid against the meta-schema. */
  valid: boolean
  /** Path to the schema file checked. */
  filePath: string
  /** Array of error messages if invalid. Empty if valid. */
  errors?: string[]
}

export class SchemaValidator {
  /**
   * Validate a single JSON Schema file against Draft 2020-12 meta-schema.
   * @param filePath - Path to the schema JSON file
   * @returns Validation result with pass/fail status
   */
  validateSchema(filePath: string): ValidationResult

  /**
   * Validate all schemas in an output directory.
   * @param outDir - Output directory containing generated schemas
   * @returns Array of validation results for each file
   */
  validateAll(outDir: string): ValidationResult[]

  /**
   * Validate sample data against a generated domain schema.
   * @param schemaPath - Path to the domain schema JSON file
   * @param baseSchemaPath - Path to the base observatie.json
   * @param sampleData - Object to validate
   * @returns Whether the data passes schema validation
   */
  validateData(schemaPath: string, baseSchemaPath: string, sampleData: unknown): boolean
}
```

### Test Fixtures (`tests/fixtures/`)

Create minimal sample data objects that exercise each theme's schema structure:

```typescript
// tests/fixtures/grondstoffen-sample.ts
export const grondstoffenSample = {
  resultTime: "2025-01-15T10:30:00Z",
  observedProperty: "...",
  hasFeatureOfInterest: "...",
  hasResult: { numericValue: 0, hasUnit: "" },
  heeftUGrondstoffenGeproduceerd: true,
  grondstof: [
    {
      bestemmingType: "riepr-operationeel-bestemmingstype:belgisch",
      hoeveelheid: 100.5,
      omschrijving: "Test grondstof",
      toepassingswijze: "riepr-operationeel-toepassingwijze:brandstof"
    }
  ]
}

// tests/fixtures/lucht-sample.ts — exercises the multi-step chain fields
// tests/fixtures/grondwater-sample.ts — exercises conditional visibility rules
// etc.
```

### Validation Tests (`tests/validation.spec.ts`)

```typescript
describe('Generated Schema Validation', () => {
  let validator: SchemaValidator

  beforeEach(() => { validator = new SchemaValidator() })

  describe('Meta-schema validation', () => {
    it('observatie.json is valid Draft 2020-12', () => { ... })
    it('grondstoffen/schema.json is valid Draft 2020-12', () => { ... })
    it('grondwater/schema.json is valid Draft 2020-12', () => { ... })
    it('lucht/schema.json is valid Draft 2020-12', () => { ... })
    it('water/schema.json is valid Draft 2020-12', () => { ... })
    it('zelfcontrole-lucht/schema.json is valid Draft 2020-12', () => { ... })
    it('zelfcontrole-water/schema.json is valid Draft 2020-12', () => { ... })
  })

  describe('Data validation against generated schemas', () => {
    it('grondstoffen sample data validates against grondstoffen schema', () => { ... })
    it('lucht sample data validates against lucht schema', () => { ... })
    // Note: some validations may fail due to unresolved enums (ISSUE-DATA-02) — document these
  })
})
```

### Comparison with Archived Schemas

Write a test or script that compares the generated `observatie.json` and `lucht/schema.json`
against their archived counterparts in `docs/archive/`:

```typescript
describe('Archive comparison', () => {
  it('generated observatie.json has same property keys as archive', () => { ... })
  it('generated observatie.json uses allOf composition pattern like archive', () => { ... })
  it('generated observatie.json references SOSA OGC API base URLs', () => { ... })
  // Not exact match — our generated version will have more themes, different $id paths
})
```

### Final Cleanup Checklist

- [ ] Run `npm run build` — zero TypeScript errors
- [ ] Run `npm test` — all unit tests pass
- [ ] Run `node dist/cli.js` — generates all 7 schema files without errors
- [ ] Validate all output files against Draft 2020-12 meta-schema via AJV
- [ ] Verify output directory structure matches expected layout
- [ ] Update `README.md` with usage instructions and architecture overview
- [ ] Review ISSUES.md for completeness — ensure all discovered gaps are documented
- [ ] Remove any console.log debugging statements; keep only structured logging (warnings for unresolved refs)
- [ ] Add `.gitignore` entries for `dist/`, `output/`, `node_modules/`
- [ ] Verify no imports from poc-flow-operationeel or other sibling POCs

## Deliverables

1. `src/services/schema-validator.ts` — AJV-based validation service
2. `tests/fixtures/*.ts` — Sample data fixtures per theme
3. `tests/validation.spec.ts` — Integration tests validating generated schemas
4. Updated `ISSUES.md` with final list of gaps discovered during testing
5. Updated `README.md` with complete project documentation
6. Clean build with no warnings, no debug logs, no cross-POC dependencies

## Definition of Done

- All unit tests pass (`npm test`)
- All generated schemas validate against Draft 2020-12 meta-schema
- At least one sample data fixture validates successfully per theme
- Output directory contains exactly 7 files: observatie.json + 6 domain schemas
- No TypeScript compilation errors (`tsc --noEmit` clean)
- README.md documents the project purpose, architecture, and usage
- ISSUES.md captures all remaining data-quality gaps with proposed solutions
- Zero console.log statements in production code (only console.warn for unresolved refs)
- `.gitignore` properly excludes dist/, output/, node_modules/
- No imports from poc-flow-operationeel or any external POC directory
- The POC is fully standalone and can be built/run from a fresh checkout
