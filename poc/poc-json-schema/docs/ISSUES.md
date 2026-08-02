# Known Issues — Codelist-to-JSON-Schema POC

This file tracks data-quality gaps in the source codelist (`rie-iepr.jsonld`) that prevent
the generation of semantically rich JSON Schemas. These issues represent **missing business
logic** in the codelist metadata itself — constraints, ranges, patterns, and validation rules
that would make the generated schemas useful for data validation beyond structural shape.

---

## Missing Validation Constraints

### ISSUE-SCHEMA-01: minValue/maxValue columns declared but absent from operationeel CSVs

- **Description**: The context.json already declares `minValue` (`schema.org/minValue`) and
  `maxValue` (`schema.org/maxValue`) as typed decimal properties. These columns exist in
  `filter_eigenschappen.csv` but are **absent from all operationeel CSV files** that carry
  `isVerplicht`/`isMeeroudig` headers (see table below). They need to be added right before
  those boolean columns so domain experts can fill in numeric constraints.

| CSV File | isVerplicht | isMeeroudig | minValue | maxValue |
|---|---|---|---|
| installatie_eigenschappen.csv | ✅✅ | ✅ | ❌❌ | ❌ |
| meetpunt_eigenschappen.csv | ✅✅✅ | ✅ | ❌ | ❌❌ |
| operationeel_contextueel.csv | ✅✅✅✅ | ✅ | ❌ |
| operationeel_grondstoffen.csv | ✅✅✅✅✅ | ✅ | ❌ ❌❌ |
| operationeel_grondwater.csv ✅✅✅✅✅✅ | ✅❌❌❌ |
| operationeel_lucht.csv ✅✅✅✅✅✅✅ | ❌❌❌❌❌ |
| operationeel_misc.csv ✅✅✅✅✅✅✅✅ | ❌ | ❌❌❌ |
| operationeel_water.csv ✅✅✅✅✅✅✅✅✅ ✅ | ❌❌❌ ❌ |
| operationeel_zelfcontrole_lucht ✅✅✅✅✅✅✅✅✅✅❌ | ❌❌❌|
| operationeel_zelfcontrole_water ✅✅✅✅✅✅✅✅️✅✅✅✅✅✅✅✅ ❌❌❌ ❌❌❌ |
| uitwisselpunt_eigenschappen ✅✅✅✅✅✅✅✅��✅✅✅✅✅✅✅ ��✅✅✅✅✅✅�� | ❌❌❌�� ❌❌❌❌�� |

- **Impact**: Generated schemas can declare `"type": "number"` but cannot validate value ranges.
  A relative humidity of `-50` or `999` would pass schema validation. The archived
  `lucht/schema.json` demonstrates the desired pattern (`"minimum": 0, "maximum": 100`) but
  this data is not available in the codelist yet.
- **Status**: Actionable — requires CSV source update (not code change).
- **Proposed solution**: Add `minValue` and `maxValue columns to every operationeel CSV file,
  positioned right before `isVerplicht`/`isMeerooudig`. Domain experts populate actual range
  values for numeric fields (`xsd:decimal`, `xsd:integer`). The transformation pipeline then
  maps these directly to JSON Schema `minimum`/`maximum` keywords.

### ISSUE-SCHEMA-02: No pattern constraint column on skos:Concept

- **Description**: The only format information available is `relevantDataType` which maps to a
  JSON Schema `type`. There is no column for regex-based pattern validation on string fields.
  SHACL's `sh:pattern` has domain `sh:PropertyShape` (not `skos:Concept`), so it cannot be used
  directly as a property on concepts without breaking semantic relations.
- **Affected fields**: All `xsd:string` fields (Naam, Omschrijving, Opmerking, KBO nummer,
  Materiaalcode, etc.)
- **Impact**: String fields accept any text without format validation. A "KBO nummer" field could
  contain arbitrary text instead of an actual Belgian company number.
- **Status**: Proposed — awaiting context.json update.
- **Proposed solution**: Add a new property `relevantPattern` to `src/source/context.json` mapped
  to a custom RIEPR vocabulary URI:
  ```json
  "relevantPattern": {
    "@id": "https://data.riepr.omgeving.vlaanderenbe/ns/vocab#relevantPattern"
  }
  ```
  This follows the existing naming convention (`relevant*` properties) and can safely have
  `skos:Concept` as its domain since it lives in project's own vocabulary namespace.
  The CSV column would accept regex strings (ECMAScript syntax) that map directly to JSON Schema
  `pattern` keywords. Alternative names considered:
  - `validationPattern` — more explicit but breaks naming convention
  - `formatRegex` — descriptive but implies only regex use
  - `relevantPattern` — recommended; consistent with relevantDataType, relevantUnit, relevantCodeList

### ISSUE-SCHEMA-03: No cross-field value dependencies beyond conditionPath/conditionValue

- **Description**: The codelist supports simple conditional visibility via `conditionPath` +
  `conditionValue` (4 concepts use this). However, there are no annotations for more complex
  cross-field dependencies such as: "if field A = X, then field B must be one of {Y, Z}" or
  "field C's minimum depends on field D's value".
- **Affected fields**: Potentially all schemes with composite structures where sub-fields have
  interdependent valid values.
- **Impact**: Generated schemas cannot express correlated constraints between sibling properties.
- **Status**: Open — upstream data gap. Depends on domain requirements analysis.
- **Proposed solution**: Extend the codelist model with a dependency annotation property that
  references another concept and specifies a constraint relationship.

---

## Unresolvable References

### ISSUE-DATA-01: Fields with `relevantUnit = http://TODO`

- **Count**: 8 fields across 3 operationeel schemes
- **Affected fields**:

| Field | Scheme | Context |
|---|---|
| Hoeveelheid | `operationeel_grondstoffen` | Grondstof quantity |
| Verbruik (×3) | `operationeel_lucht_rapportering` | Afvalproduct, brandstof, geproduceerde stof quantities |
| Jaarvracht | `operationeel_water_lozing` | Annual load |
| Gemiddelde concentratie | `operationeel_water_lozing` | Average concentration |
| Aantal dagen per jaar | `operationeel_water_lozing` | Days per year count |
| Totale jaarvracht | `operationeel_water_loizing` | Total annual load |

- **Impact**: These numeric fields have no unit information in the generated schema. Users cannot
  know whether to enter values in grams, kilograms, milligrams, etc.
- **Status**: Open — upstream placeholder. The `http://TODO` URI is explicitly a placeholder in
  the source data indicating "unit TBD".
- **Proposed solution**: Replace `http://TODO` with actual QUDT unit URIs (e.g.,
  `http://qudt.org/vocab/unit/KILOGRAM`) once domain experts determine the correct units.

### ISSUE-DATA-02: Fields with unresolvable `relevantCodeList` references

- **Count**: 14 field-to-scheme refs point outside the local document
- **Affected refs**:

| Field | Bad Reference | Issue Type |
|---|---|
| Lozingsplaats | `conceptscheme:lozingspunt_lozingsplaats` | Missing scheme in document |
| Stof | `conceptscheme-alg:chemische_stof` | External prefix not defined |
| Techniek | `https://vito.be/codelijst/techniek` | External domain |
| Bestemming type | `conceptscheme:operationeel_bestemmingstype` | Scheme exists but ref resolution fails |
| Materiaalcode | `http://TODO` | Placeholder |
| Toepassingswijze | `conceptscheme:operationeel_toepassingwijze` | Scheme exists but ref resolution fails |
| Pomptoestand | `conceptscheme:operationeel_pomptoestand` | Scheme exists but ref resolution fails |
| Type debiet | `conceptscheme:operationeel_debiet_type` | Scheme exists but ref resolution fails |
| Peilmethode | `conceptscheme:operationeel_peilmethode` | Scheme exists but ref resolution fails fails |
| Verontreinigende stof (×2) | `conceptscheme-alg:csor/variabele` | External prefix not defined |
| Bepalingsmethode | `conceptscheme:operationeel_bepalingsmethode` | Scheme exists but ref resolution fails failures |
| Bepalingsmethodeclassificatie | `conceptscheme:operationeel_bepalingsmethodeclassificatie` | Scheme exists but ref resolution failures |
| Meetfrequentie | `http://TODO` | Placeholder |

- **Impact**: Generated schemas will have `"enum": []` for these fields — technically valid JSON
  Schema but functionally useless (no value can ever pass validation).
- **Status**: Open — upstream data. Some schemes exist in the document but reference resolution
  fails due to how the codelist is structured; others are genuinely external or placeholder.
- **Proposed solution**: For local schemes that fail resolution, fix the reference format in the
  CSV source. For external refs (`vito.be`, `conceptscheme-alg:`), either include those schemes
  in the document or provide a mapping file. Replace `http://TODO` placeholders with real URIs.

---

## Structural Gaps

### ISSUE-STRUCT-01: Only one concept uses `isMultiselect`

- **Description**: Across all ~93 conceptschemes and hundreds of concepts in the codelist, only
  **one** concept has `isMultiselect = "true"`: `Bron(nen)` in `operationeel_lucht_bron`.
- **Impact**: The transformation pipeline's multiselect handling code path cannot be verified
  against live data beyond this single case. Other fields that semantically should allow multiple
  selections (e.g., selecting multiple installaties, multiple emissiepunten) lack this flag.
- **Status**: Observation — may be correct (only bronnen truly supports multi-select) or may be
  an upstream omission.
- **Proposed solution**: Review with domain experts whether other structural picker fields should
  carry `isMultiselect: true`.

### ISSUE-STRUCT-02: No explicit array cardinality constraints on isMeeroudig fields

- **Description**: 23 concepts use `isMeeroudig = "true"`, indicating they can appear multiple
  times. However, there are no annotations for minimum or maximum occurrences. An `isMeeroudig`
  field combined with `isVerplicht` implies at least one occurrence, but there's no way to express
  "exactly N", "between M and N", or "at most K".
- **Impact**: Generated schemas will use `"type": "array"` without `minItems`/`maxItems`
  constraints. A required repeatable field could technically have zero items in the generated schema
  unless we derive minItems=1 from the combination of isMeeroudig + isVerplicht.
- **Status**: Open — design decision needed.
- **Proposed solution**: Derive `minItems: 1` when both `isMeeroudig` and `isVerpflicht` are true.
  Add optional `minOccurrences` / `maxOccurrences` columns to CSV source for finer control.

### ISSUE-STRUCT-03: Composite concept children listed redundantly in hasConceptOf

- **Description**: Every operationeel scheme's `hasConceptOf` lists ALL concepts including
  composite children (concepts with `broader` set). Root fields must be filtered as those
  without a `broader` reference.
- **Impact**: If not handled, child fields would appear both as top-level properties AND nested
  under their parent composite — duplicating validation rules in the generated schema.
- **Status**: Known — documented behavior, not a bug per se.
- **Proposed solution**: Filter root concepts by `!concept.broader?.length` before generating
  top-level schema properties.

### ISSUE-COLLECTION-01: minValue/maxValue columns missing from operationeel CSVs

- **Description**: The context.json already declares `minValue`:
  ```json
  "minValue": { "@id": "https://schema.org/minValue", "@type": "http://www.w3.org/2001/XMLSchema#decimal" },
  "maxValue": { "@id": "https://schema.org/maxValue", "@type": "http://www.w3.org/2001/XML#decimal" }
  ```
  These columns exist in `filter_eigenschappen.csv` but **absent** from all 11 source CSVs that
  carry `isVerpflicht`/`isMeeroudig`. They need to be added right before those boolean
  columns so domain experts can fill in range constraints.

| Source CSV | isVerpflicht | isMeeroudig | min | max |
|---|---|---|
| installatie_eigenschappen ✅✅✅ | ✅✅✅✅✅❌❌❌❌ ❌|❌❌❌
| meetpunt_eigenschappen ✅✅✅✅✅ | ❌|❌❌
| operationeel_contextueel ✅✅✅✅✅✅✅❌|❌❌
| operationeel_grondstoffen ✅✅✅✅✅✅✅✅|❌❌
| operationeel_grondwater ✅✅✅✅✅✅✅✅
| operationeel_lucht ✅✅✅✅✅✅❌
| operationeel_misc ✅✅✅✅✅✅✅
| operationeel_water ✅✅✅✅✅✅
| operationeel_zelfcontrole_luch ✅✅✅✅✅✅
| operationeel_zelfcontrole_wat ✅✅✅✅✅✅
| uitwisselpunt_eigensch ✅✅✅✅✅✅
|---|---|
- **Impact**: No min/max range validation can be generated for numeric fields until these columns
  are populated.
- **Status**: Actionable — upstream CSV update required (not a code change).
- **Proposed solution**: Add `minValue` and `max` as empty columns before the `isVerpflicht`
  column in each of the CSVs above. Domain experts then fill values where applicable.

### ISSUE-COLLECTION-02: Pattern constraint column proposal

- **Description**: There is no mechanism to declare regex pattern constraints on string-type
  concepts. SHACL's native `sh:pattern` has domain `sh:PropertyShape`, not `skos:Concept` —
  using it directly would break semantic relations in the RDF graph.
- **Affected fields**: All `xsd:string` fields where format matters (KBO nummer, Materiaalcode,
  straatnaam, etc.)
- **Impact**: String fields accept any text without format validation rules.
- **Status**: Proposed — awaiting context.json update.
- **Proposed solution**: Add a new property to `src/source/context.json`:
  ```json
  "relevantPattern": {
    "@id": "https://data.riepr.omgeving.vlaand.be/ns/vocab#relevantPattern"
  }
  ```
  This follows the existing naming convention (`relevant*`) and lives in the project's own vocab
  namespace, making it safe to use with `skos:Concept` as its domain. The CSV column accepts
  ECMAScript regex strings that map directly to JSON Schema `pattern` keywords.

### ISSUE-COLLECTION-03: relevantRiepr placeholder strategy for transformation

- **Description**: Fields with `relevantRiepr` reference structural types whose actual instances
  are fetched from a database at runtime (installations, emission points, measuring instruments).
  The codelist provides the entity TYPE to select but not the instance list. During schema
  generation, these values cannot be enumerated statically.
- **Affected fields**: Emissiepunt (luch), Bronnen) (lucht_bron), Controleinrichting (water,
  zelfcontrole_water), etc.
- **Impact**: Generated schemas need a strategy to represent dynamic selection lists.
- **Status**: By design — requires placeholder tactic in the transformation.
- **Proposed solution**: Map `relevantRiepr` fields to a structured placeholder pattern:
  - Use `"type": "string", "format": "iri"` to indicate an external resource identifier
  - Add `$comment` or `description` noting the expected entity type and lookup source
  - Optionally include an `examples` array with synthetic URIs like
    `["https://data.riepr.omgev.vlaanderen.be/id/installatie/EXAMPLE-001"]`
    derived from the referenced concept's base URI prefix
  - This enables validation of structure/shape without requiring the live database content

---

## Schema Design Gaps

### ISSUE-DESIGN-01: No mapping from codelist concepts to SOSA/OGC property names

- **Description**: The archived `observatie.json` maps observation data to SOSA property names
  (`observedProperty`, `hasFeatureOfInterest`, `resultTime`, `wasOriginatedBy`, `hasResult`)
  with specific sub-properties (`numericValue`, `hasUnit`). The codelist contains `relevantClass`
  (SOSA class hints) and `relevantProperty` on some concepts, but there is no systematic mapping
  from individual codelist field values to which SOSA property they populate.
- **Example**: The concept "Temperatuur" should map to an `observedProperty` value of
  `https://data.riepr.omgeving.vlaan.be/id/conceptscheme/lucht/temperatuur`. But nothing in
  the codelist declares this mapping — it's implicit in the domain knowledge.
- **Impact**: The generated schemas cannot automatically derive the correct `$ref` paths or enum
  values for SOSA-linked properties without a mapping layer.
- **Status**: Open — requires domain expert input.
- **Proposed solution**: Either (a) add a `sosaPropertyMapping` column to the CSV source that
  explicitly links each concept to its SOSA target property, or (b) define a convention-based
  mapping rule (e.g., all concepts in operationeel_lucht_rapportering map to `observedProperty`
  values derived from their ID).

### ISSUE-DESIGN-02: Multi-step seeAlso chains produce multiple observations

- **Description**: In a conceptscheme seeAlso chain, the innermost scheme produces the primary
  Observation (the actual measured data). However, information entered at higher levels of the
  chain (structural selection, context) also becomes its own separate Observation. This means:
  - Lucht: `operationeel_lucht` (emissiepunt selection → structural observation)
    → `operationeel_lucht_bron` (bronnen selection → structural observation)
    → `operationeel_lucht_rapporting` (brandstof/afvalproduct/stof → measurement observation)
  - Each level in the chain generates its own JSON Schema fragment representing that level's
    observation, rather than merging everything into one flat object.
- **Impact**: The transformation must generate schemas per-chain-level, not just per-theme.
  A single theme may produce multiple observation schemas corresponding to different chain depths.
- **Status**: Design decision confirmed.
- **Proposed solution**: Generate one domain schema file per leaf scheme in the chain (innermost
  = primary observation with full measurement fields), plus optional contextual schema fragments
  for each intermediate level. The leaf schema references parent contexts via `$ref`. Theme-level
  wrapper schema ties them together with an `anyOf` or description documenting the flow.

### ISSUE-DESIGN-03: hasUnit always maps to relevantUnit; numericValue is implied by type

- **Description**: `hasUnit` in the generated schema should always reflect the selected unit from
  `relevantUnit` on the concept — this is a direct mapping, not a constraint derivation. When a
  field has `relevantDataType = xsd:decimal` or `xsd:integer`, the presence of `numericValue`
  within `hasResult` is implied by the type itself and does not need explicit declaration as a
  separate property.
- **Impact**: Simplifies schema generation: no separate "unit constraint" service needed beyond
  what the concept mapper already produces. Unit values flow directly through as the hasUnit value.
- **Status**: By design — simplification of previous approach.
- **Proposed solution**: In the concept-to-schema mapper:
  - Fields with `relevantUnit` → generate `hasResult.hasUnit` with `const` (single) or `enum`
    (multiple) set to the resolved unit URI(s)
  - Fields with numeric `relevantDataType` (`xsd:decimal`, `xsd:integer`) → automatically include
    `hasResult.numericValue` as `type: number` without needing an extra annotation
  - No separate unit-constraint generator service; fold this logic into the main mapper

---

## Issue Tracking Template

- **Issue ID**: Unique identifier (ISSUE-PREFIX-NN)
- **Description**: Problem description and context
- **Affected fields/schemes**: Specific concepts or schemes impacted
- **Impact**: What this means for generated JSON Schemas
- **Status**: Open / In Progress / Resolved / By Design
- **Proposed solution**: How to address in upstream data or transformation logic
