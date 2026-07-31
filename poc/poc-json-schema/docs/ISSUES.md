# Known Issues — Codelist-to-JSON-Schema POC

This file tracks data-quality gaps in the source codelist (`rie-iepr.jsonld`) that prevent
the generation of semantically rich JSON Schemas. These issues represent **missing business
logic** in the codelist metadata itself — constraints, ranges, patterns, and validation rules
that would make the generated schemas useful for data validation beyond structural shape.

---

## Missing Validation Constraints

### ISSUE-SCHEMA-01: No min/max/range constraints on numeric fields

- **Description**: The archived `lucht/schema.json` demonstrates conditional range validation
  (`"minimum": 0, "maximum": 100` for relative humidity), but **no concept in the entire
  codelist carries any SHACL-like constraint properties** such as `sh:minInclusive`,
  `sh:maxInclusive`, `sh:minExclusive`, `sh:maxExclusive`, or equivalent. All concepts with
  `relevantDataType = xsd:decimal` have no range information attached.
- **Affected fields**: Every numeric field across all operationeel schemes (Hoeveelheid, Verbruik,
  AS-gehalte, S-gehalte, Diepte/hoogte, Jaarvracht, Gemiddelde concentratie, etc.)
- **Impact**: Generated schemas can declare `"type": "number"` but cannot validate value ranges.
  A relative humidity of `-50` or `999` would pass schema validation.
- **Status**: Open — upstream data gap.
- **Proposed solution**: Add SHACL constraint properties to the CSV source data that feeds the
  codelist generator. E.g., columns for `minValue`, `maxValue`, `unitSystem` on numeric concepts.

### ISSUE-SCHEMA-02: No pattern/format constraints beyond basic type mapping

- **Description**: The only format information available is `relevantDataType` which maps to a
  JSON Schema `type`. There are no `sh:pattern`, regex patterns, string length limits
  (`sh:minLength` / `sh:maxLength`), or enumerated valid formats for any concept in the codelist.
- **Affected fields**: All `xsd:string` fields (Naam, Omschrijving, Opmerking, KBO nummer, etc.)
- **Impact**: String fields accept any text without format validation. A "KBO nummer" field could
  contain arbitrary text instead of an actual Belgian company number.
- **Status**: Open — upstream data gap.
- **Proposed solution**: Add `pattern` and/or `format` columns to the CSV source for string-type
  concepts where format matters.

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
|---|---|---|
| Hoeveelheid | `operationeel_grondstoffen` | Grondstof quantity |
| Verbruik (×3) | `operationeel_lucht_rapportering` | Afvalproduct, brandstof, geproduceerde stof quantities |
| Jaarvracht | `operationeel_water_lozing` | Annual load |
| Gemiddelde concentratie | `operationeel_water_lozing` | Average concentration |
| Aantal dagen per jaar | `operationeel_water_lozing` | Days per year count |
| Totale jaarvracht | `operationeel_water_lozing` | Total annual load |

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
|---|---|---|
| Lozingsplaats | `conceptscheme:lozingspunt_lozingsplaats` | Missing scheme in document |
| Stof | `conceptscheme-alg:chemische_stof` | External prefix not defined |
| Techniek | `https://vito.be/codelijst/techniek` | External domain |
| Bestemming type | `conceptscheme:operationeel_bestemmingstype` | Scheme exists but ref resolution fails |
| Materiaalcode | `http://TODO` | Placeholder |
| Toepassingswijze | `conceptscheme:operationeel_toepassingwijze` | Scheme exists but ref resolution fails |
| Pomptoestand | `conceptscheme:operationeel_pomptoestand` | Scheme exists but ref resolution fails |
| Type debiet | `conceptscheme:operationeel_debiet_type` | Scheme exists but ref resolution fails |
| Peilmethode | `conceptscheme:operationeel_peilmethode` | Scheme exists but ref resolution fails |
| Verontreinigende stof (×2) | `conceptscheme-alg:csor/variabele` | External prefix not defined |
| Bepalingsmethode | `conceptscheme:operationeel_bepalingsmethode` | Scheme exists but ref resolution fails |
| Bepalingsmethodeclassificatie | `conceptscheme:operationeel_bepalingsmethodeclassificatie` | Scheme exists but ref resolution fails |
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

### ISSUE-STRUCT-02: No explicit array cardinality constraints on isMeervoudig fields

- **Description**: 23 concepts use `isMeervoudig = "true"`, indicating they can appear multiple
  times. However, there are no annotations for minimum or maximum occurrences. An `isMeervoudig`
  field combined with `isVerplicht` implies at least one occurrence, but there's no way to express
  "exactly N", "between M and N", or "at most K".
- **Impact**: Generated schemas will use `"type": "array"` without `minItems`/`maxItems`
  constraints. A required repeatable field could technically have zero items in the generated schema
  unless we derive minItems=1 from the combination of isMeervoudig + isVerplicht.
- **Status**: Open — design decision needed.
- **Proposed solution**: Derive `minItems: 1` when both `isMeervoudig` and `isVerplicht` are true.
  Add optional `minOccurrences` / `maxOccurrences` columns to CSV source for finer control.

### ISSUE-STRUCT-03: Composite concept children listed redundantly in hasTopConcept

- **Description**: Every operationeel scheme's `hasTopConcept` lists ALL concepts including
  composite children (concepts with `broader` set). Root fields must be filtered as those
  without a `broader` reference. This redundancy means the transformation must apply the same
  filtering rule that `poc-flow-operationeel` uses (`getTopLevelConcepts`).
- **Impact**: If not handled, child fields would appear both as top-level properties AND nested
  under their parent composite — duplicating validation rules.
- **Status**: Known — documented behavior, not a bug per se.
- **Proposed solution**: The transformation pipeline should always filter root concepts by
  `!concept.broader?.length` before generating top-level schema properties. Document this as a
  mandatory step in the processing pipeline.

---

## Schema Design Gaps

### ISSUE-DESIGN-01: No mapping from codelist concepts to SOSA/OGC property names

- **Description**: The archived `observatie.json` maps observation data to SOSA property names
  (`observedProperty`, `hasFeatureOfInterest`, `resultTime`, `wasOriginatedBy`, `hasResult`)
  with specific sub-properties (`numericValue`, `hasUnit`). The codelist contains `relevantClass`
  (SOSA class hints) and `relevantProperty` on some concepts, but there is no systematic mapping
  from individual codelist field values to which SOSA property they populate.
- **Example**: The concept "Temperatuur" should map to an `observedProperty` value of
  `https://data.riepr.omgeving.vlaanderen.be/id/conceptscheme/lucht/temperatuur`. But nothing in
  the codelist declares this mapping — it's implicit in the domain knowledge.
- **Impact**: The generated schemas cannot automatically derive the correct `$ref` paths or enum
  values for SOSA-linked properties without a mapping layer.
- **Status**: Open — requires domain expert input.
- **Proposed solution**: Either (a) add a `sosaPropertyMapping` column to the CSV source that
  explicitly links each concept to its SOSA target property, or (b) define a convention-based
  mapping rule (e.g., all concepts in operationeel_lucht_rapportering map to `observedProperty`
  values derived from their ID).

### ISSUE-DESIGN-02: Multi-step seeAlso chains need schema composition strategy

- **Description**: Some themes chain through multiple schemes via `seeAlso`:
  - Lucht: `operationeel_lucht` → `operationeel_lucht_bron` → `operationeel_lucht_rapportering`
  - Water: `operationeel_water` → `operationeel_water_lozing`
  - Zelfcontrole water: `operationeel_zelfcontrole_water` → `operationeel_zelfcontrole_water_meting`

  Each scheme in the chain contributes fields to the final observation object. The transformation
  must decide how to compose these into a single coherent JSON Schema per theme.
- **Impact**: Without a clear composition strategy, generated schemas may be fragmented across
  multiple files with unclear `$ref` relationships between them.
- **Status**: Open — design decision needed before implementation.
- **Proposed solution**: Two options:
  1. **Flat composition**: Merge all fields from chained schemes into a single theme schema file.
     Simpler output but loses the structural separation of concerns.
  2. **Hierarchical refs**: Generate one schema per intermediate scheme and use `$ref` to compose.
     More files but mirrors the codelist structure faithfully.
  
  Recommended approach for POC: flat composition (option 1) since it matches the archived pattern
  where `lucht/schema.json` is a single self-contained file.

### ISSUE-DESIGN-03: relevantRiepr structural selections have no enum values in the schema

- **Description**: Fields with `relevantRiepr` point to structural types (installations, emission
  points, measuring instruments). These represent runtime selections of physical entities that
  exist in a database, not static code list values. The codelist provides the type of entity to
  select (e.g., `riepr-emissiepunt-type:schoorsteen`) but not the actual instances.
- **Impact**: Generated schemas cannot provide an `enum` for these fields. They must be declared
  as `"type": "string"` with a format hint or description explaining they reference external
  resource IDs.
- **Status**: By design — these are dynamic lookups, not static enums.
- **Proposed solution**: Map `relevantRiepr` fields to `"type": "string", "format": "uri"`,
  `"description": "<prefLabel> — select from registered <entity type>"`. Use `$ref` to an
  external schema if one exists for the referenced entity type.

---

## Issue Tracking Template

- **Issue ID**: Unique identifier (ISSUE-PREFIX-NN)
- **Description**: Problem description and context
- **Affected fields/schemes**: Specific concepts or schemes impacted
- **Impact**: What this means for generated JSON Schemas
- **Status**: Open / In Progress / Resolved / By Design
- **Proposed solution**: How to address in upstream data or transformation logic
