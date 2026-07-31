# Task 04 — Base Observatie Schema Generator

Generate the base observation schema (`observatie.json`) that all domain-specific schemas extend.
This schema defines the common SOSA observation properties with Dutch labels and type constraints,
matching the structure of the archived reference file at `docs/archive/observatie.json`.

## Scope

### Class: `BaseSchemaGenerator` (`src/services/base-schema-generator.ts`)

```typescript
export class BaseSchemaGenerator {
  /**
   * Generate the base observatie JSON Schema.
   * @returns A JsonSchemaObject conforming to Draft 2020-12
   */
  generate(): JsonSchemaObject
}
```

### Schema Structure

The base schema is **static** — it does not depend on codelist data. It defines the common
observation envelope that every theme's data fills in. The content is derived from the archived
reference but expressed programmatically via the `JsonSchemaObject` model from Task 02.

Properties (mirroring `archive/observatie.json`):

| Property | Type | Description | Notes |
|---|---|---|---|
| `resultTime` | string / date-time | Datum en tijdstip van de observatie | Refs SOSA OGC API; x-ui-first extension |
| `observedProperty` | string / uri | De gemeten grootheid of parameter | Refs SOSA OGC API; domain schemas constrain enum |
| `hasFeatureOfInterest` | string / uri | Het meetpunt waarop de observatie betrekking heeft | Refs SOSA OGC API; x-ui-after extension |
| `wasOriginatedBy` | string | De activiteit of oorzaak achter de emissie | Refs SOSA OGC API extra terms |
| `hasResult` | object | Resultaat van de observatie | Contains numericValue + hasUnit sub-properties |

### Implementation Details

1. **$schema and $id**: Use Draft 2020-12 meta-schema URL and a stable `$id`:
   ```json
   "$schema": "https://json-schema.org/draft/2020-12/schema",
   "$id": "https://data.riepr.omgeving.vlaanderen.be/schema/2026/observatie/observatie.json"
   ```

2. **SOSA Property References**: Each property uses `allOf` to combine:
   - A `$ref` to the official SOSA OGC API schema property definition (e.g.,
     `https://opengeospatial.github.io/ogcapi-sosa/build/annotated/sosa/properties/observation-owa/schema.json#/properties/observedProperty`)
   - A local override with Dutch `title`, `description`, type, and extensions

3. **Extensions**: Include `x-ui-first`, `x-ui-after`, `x-jsonld-id`, `x-jsonld-type` extensions
   matching the archived reference pattern. These are informational — they guide potential UI
   generators but don't affect validation.

4. **hasResult Sub-object**: Define inline as an object with required sub-properties:
   - `numericValue`: number type with JSON-LD annotations (`x-jsonld-id`, `x-jsonld-type`)
   - `hasUnit`: string with uri-template format and JSON-LD annotations

### Implementation Code Sketch

```typescript
const SOSA_BASE = 'https://opengeospatial.github.io/ogcapi-sosa/build/annotated/sosa/properties/observation-owa/schema.json'

export class BaseSchemaGenerator {
  generate(): JsonSchemaObject {
    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'https://data.riepr.omgeving.vlaanderen.be/schema/2026/observatie/observatie.json',
      description: 'RIE-IEPR observatie',
      type: 'object',
      properties: {
        resultTime: this.buildProperty('resultTime', 'Tijdstip', 'Datum en tijdstip waarop de observatie is uitgevoerd.', {
          'x-ui-first': true,
          format: 'date-time',
        }),
        observedProperty: this.buildProperty('observedProperty', 'Geobserveerde eigenschap',
          'De gemeten grootheid of parameter, zoals een specifieke stof, temperatuur of druk.'),
        hasFeatureOfInterest: this.buildProperty('hasFeatureOfInterest', 'Meetpunt',
          'Het meetpunt waarop de observatie betrekking heeft.', { 'x-ui-after': 'observedProperty' }),
        wasOriginatedBy: this.buildExtraTerm('wasOriginatedBy', 'Oorzaak emissie',
          'De activiteit of oorzaak die aan de basis ligt van de gemeten emissie.'),
        hasResult: this.buildHasResult(),
      },
    }
  }

  private buildProperty(sosaName: string, title: string, desc: string, extra = {}): JsonSchemaObject {
    return {
      allOf: [
        { $ref: `${SOSA_BASE}/#/properties/${sosaName}` },
        { title, description, ...extra },
      ],
    }
  }

  // etc.
}
```

### Unit Tests (`src/services/base-schema-generator.test.ts`)

```typescript
describe('BaseSchemaGenerator', () => {
  it('generates a valid Draft 2020-12 schema', () => { ... })
  it('has correct $id and $schema values', () => { ... })
  it('defines resultTime with x-ui-first extension', () => { ... })
  it('defines observedProperty with SOSA ref', () => { ... })
  it('defines hasFeatureOfInterest with x-ui-after extension', () => { ... })
  it('defines wasOriginatedBy from SOSA extra terms', () => { ... })
  it('defines hasResult as object with numericValue and hasUnit sub-properties', () => { ... })
  it('all property definitions use allOf composition pattern', () => { ... })
})
```

## Deliverables

1. `src/services/base-schema-generator.ts` — Generator class producing the base observatie schema
2. `src/services/base-schema-generator.test.ts` — Unit tests verifying schema structure
3. Generated output matches the semantic content of `docs/archive/observatie.json`

## Definition of Done

- All unit tests pass
- Generated JSON is valid Draft 2020-12 (verifiable via ajv meta-schema validation)
- Output contains all 5 properties: resultTime, observedProperty, hasFeatureOfInterest, wasOriginatedBy, hasResult
- Each property uses `allOf` composition with SOSA `$ref` + local override
- Dutch labels match the archived reference
- Extensions (`x-ui-first`, `x-ui-after`, `x-jsonld-id`, `x-jsonld-type`) are present where expected
