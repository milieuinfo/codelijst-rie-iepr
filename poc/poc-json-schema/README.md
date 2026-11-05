# Code lists -> operational JSON Schema

Compile the groundwater CSV into JSON Schema Draft 2020-12, shared by the UI and
ODS consumers.
The Dutch [CSV-to-schema/UI/ODS guide](../../README.md#van-csv-naar-json-schema-ui-en-ods)
is the conceptual specification, including ownership, predicates, required kinds
and reversible spreadsheet mappings.

## Current groundwater CSV profile

`npm run predev` creates a deterministic input snapshot from
`src/source/operationeel_grondwater.csv`, `operationeel_misc.csv` (choice lists),
and the published JSON-LD supporting lists/prefixes. Other operational CSVs and
`thematypes.csv` are not parsed. The reporting entry point is explicitly
`conceptscheme:operationeel_grondwater`; its three top-level concepts define the
three reporting sections. Publication/source changes invalidate the snapshot.

```bash
npm install
npm run predev
npm run build
npm run generate -- --theme Grondwater
```

The current source generates all three sections without incomplete mode.
Ordering, conditions, variable references, shared end-date ownership and the
`Debieten` sheet name are source-authored. Quality reporting does not introduce a separate
Sample entity: the `Monsters` row is the collection context, and parameter
characteristics are stored inside each implicit `riepr:Resultaat`.
Result characteristics use the local names of their declared relations:
`measurementMethod` (`schema:measurementMethod`), `type` (`dcterms:type`) and
`additionalProperty` (`schema:additionalProperty`). The detection-limit indicator
is a `schema:PropertyValue` with a constant published `propertyID` and a selectable
`value` (above/below); it is not a numeric detection threshold. UI/ODS retain the
source labels and hide that constant identifier.
The compiler does not repair inconsistent source facts, invent aliases or publish a
partial section. `--allow-incomplete` reports each blocked section and fails without
publishing an index if all three are blocked.

| Source | Current schema contract |
|---|---|
| `_table_workbook`, `_table_sheet` | `x-table-workbook`, `x-table-sheet`; ODS uses the declared filenames/tabs |
| `prefLabel` | Exact field titles, including inside structural containers |
| `isOnzichtbaar` | Preserve typed objects and their children; suppress structural input/group labels |
| `relevantObservation` | Observation ownership independent of table/`broaderPartitive` layout; multiple targets allowed |
| `relevantFeatureClass` | `x-feature-mapping` / `x-relevant-feature-classes`; picker inputs map to one constructed feature (e.g. annual Onttrekking or grouped Emissie), not several shared features; actual construction/storage is outside this POC |
| Numeric `riepr:Observatie` | Observation with an implicit typed `hasResult` / `riepr:Resultaat` and `qudt:numericValue` |
| Non-SOSA characteristics of an Observation | Inside its implicit Resultaat, retaining declared predicates; missing relations block generation |
| `relevantUnit` | Fixed unit or expanded unit-collection choices, never a collection URI used as a unit |

The active reporting schemas do not add synthetic entity `@id` fields or ODS
row/link fields. They retain only source fields, necessary semantic structure,
units and declared constants; the ODS consumer does not turn machine constants
into input columns.

Collections expose one `hasMember` array, never separate concept-named observation
properties. Its `items.oneOf` variants require `observedProperty`: scalar readings
use their published source concept URI; parameter analyses retain their selected
parameter URI. `contains` cardinalities require the reported quantity and prevent
duplicate singleton readings. Quality depth and parameter results share this array.
`x-member-layout` preserves singleton input columns and repeated detail groups.
The shared presentation/data/path mappings let UI and ODS edit those groups while
validating and exporting the canonical array.

Every nested reporting property must declare a predicate, except explicit
feature-construction inputs. A class alone is not a relation: the laboratory is
`wasAssociatedWith` (`prov:wasAssociatedWith`) targeting its typed `prov:Agent`
with `rdfs:label`. This PROV association also classifies its owning observation
collection as an Activity. Reference points and the spui indicator use
`schema:additionalProperty` / `schema:PropertyValue`, never concept URIs as
predicates. All additional properties share one `additionalProperty` array,
discriminated by constant `propertyID`; `contains` constraints preserve required
fields and singleton cardinalities. Their source input layout, units and
conditions are preserved by `x-property-layout`. Source omissions are errors,
not silently synthesized predicates.

The CSV declares `sosa:resultTime` on Startdatum and Einddatum.
Startdatum targets startmeterstand; Einddatum targets both
eindmeterstand and hoeveelheid via `relevantObservation`. A shared field is
entered once on a required target when available, so dates do not force optional
meter readings into existence. Other targets carry `x-derived-from-source`.
The shared browser/Node `materializeDerivedValues` helper fills existing target
objects within the same repeated record; conflicting supplied values are errors.
The UI projection and ODS import/export use that helper.

Synthetic end-to-end contracts live in `tests/groundwater-csv*.ts` and the
corresponding UI/ODS tests. They do not rewrite or silently correct the real CSV.
`tests/groundwater-contract.spec.ts` compiles the actual CSV and validates the
persistent input examples in `examples/grondwater/*.json`, using `refs.json` and
`reference-context.json`. The examples cover zero values, optional readings,
shared end dates, pump-state conditions and multiple selected filters.
They are reporting inputs: `x-feature-mapping` still describes a later feature
construction step, not an already completed RDF storage transformation.

## Selecting sections and handling incomplete metadata

`--out <directory>` creates an independent snapshot. `--section` requires
`--theme` and accepts the published source concept's CURIE or full IRI. It must
identify a top-level reporting record, not a nested field or structural picker.
Omit it to compile all reachable reporting sections, provided their source
metadata is complete. `--theme` uses the theme's display label.
Use `--section grondwater:onttrekking` or `--section grondwater:peilmeting` for
the other groundwater slices. Omit `--section` to generate all three together.
Filtered snapshots contain only the selected section.

For example:

```bash
npm run generate -- --theme Grondwater --section grondwater:kwaliteitsmeting
```

`--allow-incomplete` compiles sections in the requested active scope
independently. It emits bases and valid section schemas, **not combined theme
schemas**, and reports every blocked section to stderr and
`output/schema/index.json` under `generation.blockedSections`. Diagnostics include
the section/field source identities, issue codes and messages.
No field is silently dropped from a valid section. This flag does not enable
other operational CSVs or restore the removed theme-entry scheme.

The index records `generation.mode` and `generation.complete`. Completeness is
within the requested reachable scope, with optional `theme`/`sectionConceptId`
filters recorded in the report, not a claim about all source CSVs or Teepak
coverage. The flag combines with `--theme`, `--section` and `--out`. Missing or
unsupported leaf types and unresolved units/code lists block their section;
graph errors, invalid schemas, stale input, I/O and unexpected exceptions remain
fatal. Exit status is zero only when at least one usable section is generated;
an entirely blocked selection fails without publishing a new index. Without
the flag, incomplete source metadata still fails generation.

## Compilation contract

### Generic and personalized variants

The generic schema keeps external structural selections as strings annotated
with `x-reference-types`. Standard JSON Schema validators do not interpret this
annotation. The shared semantic validator already checks supplied reference
identities, types, reporting year and actual selected parent context.

Generate both generic and personalized schemas in one run:

```bash
npm run generate -- --theme Grondwater \
  --references examples/refs.json \
  --reference-context examples/reference-context.json
```

Paths are relative to the package working directory (`npm --prefix` also changes
that directory). `--references` is an array of `{id,label,types,year?,parents?}`;
`--reference-context` is `{year?,ids?}` and requires `--references`.
Without these options, generation remains generic-only: the generator never
guesses an organization's instances or inserts demonstration references by default.

Each theme/section retains its unchanged `schema.json` and gains
`schema.personalized.json`. The index records personalized files as
`kind: "personalized"` with `genericSchemaId`, separate IDs and content hashes;
they are variants, not duplicate reporting sections. A later generic-only run
removes obsolete indexed variants using the same owned-file safeguards.
Use a private `--out` directory for real organization data: synchronized indexed
files may otherwise be copied into publicly deployed consumer assets.

`personalizeReferenceSchema(schema, {references, referenceContext, dependencies})`
is shared by Node and browser consumers. It returns an independent schema with:

- Reference enums at scalar leaves, array items and PropertyValue values, including
  inside discriminated `oneOf` branches; existing enums/constants are intersected.
- Type/year filtering and possible record/ancestor/external parent scope.
  Missing matching instances produce `not: {}`, never invalid `enum: []`
  or a permissive string fallback.
- `x-reference-options: [{id,label}]` for dropdown labels, and a root
  `x-reference-snapshot` containing `genericSchemaId`, the used references and
  `referenceContext`. `referenceSnapshot()` reads that metadata.
- Inlined offline schema references; all original required-member, singleton,
  numeric, format and conditional constraints remain in force.

The result validates offline with an ordinary Draft 2020-12 validator, without
the reference service. Personalization does not modify the generic input.
Year-scoped references require matching context; timeless references remain
eligible. Labels are presentation metadata; enums contain exact URI identities.

Enums describe possible selections, not every combination of selections:
an admitted child may still require an actually selected parent in its record.
Keep semantic validation for those relationships, collection context, identity
and temporal-range rules. `SemanticValidator` defaults to the embedded snapshot
when explicit reference options are absent. A personal schema is a snapshot,
not live database validation or authorization, and must be regenerated when its
reference data/context changes.

### Shared consumers

The [operational table UI](../poc-flow-operationeel/README.md) is another consumer
of this exact indexed snapshot. Its dev/build hooks and the ODS sync wrapper share
`scripts/sync-schema-snapshot.mjs`; neither consumer invents missing source facts.
The package's `codelijst-rie-iepr-poc-json-schema/browser` entry point exports
browser-safe structural/semantic validators, schema registry helpers and index
parsing without Node filesystem imports. The ordinary entry point retains the
Node schema-file APIs. The UI keeps inactive draft values but validates a projection
excluding them; ODS import continues to reject inactive supplied cells.

| Existing source information | Generated contract |
|---|---|
| `vervolgstap` (`qb:codeList`) | Navigation metadata; not the active groundwater entry mechanism |
| `broaderPartitive` / `relevantObservation` | Source grouping / explicit semantic ownership; table placement cannot change the owner |
| `isMeervoudig` / `isMultiselect` | Distinct record arrays / value-reference arrays, at every depth |
| `relevantClass` / `relation` | `x-jsonld-type` / `x-jsonld-id`; preserve source-declared objects and agents, never invent a Sample/Sampling layer |
| Integer, decimal, boolean | Real JSON integer, number, boolean values |
| Date, datetime, duration | Strings with enforced `date`, `date-time`, `duration` formats |
| `dcterms:temporal` | `{start,end}`, either both dates or both datetimes |
| `relevantUnit` | Local `{numericValue,hasUnit}`; on a literal `qudt:numericValue`, `hasUnit` belongs to its owning object |
| `schema:PropertyValue` leaf | `{propertyID,value,unitCode?}`; published field URI identifies the property, constraints/references/formats stay on `value` |
| Scalar Observation | Member in canonical `hasMember`, with a fixed `observedProperty` and typed result |
| `schema:additionalProperty` | Canonical PropertyValue array with `propertyID`; source-shaped input retained separately |
| `isVerplicht` on predicate-array variants | Discriminator-specific `contains` / `minContains`; `maxContains: 1` for singleton kinds |
| Numeric `riepr:Observatie` | Typed `riepr:Resultaat` with `numericValue`, including when no unit is declared; no unit is guessed |
| `relevantCodeList` | Full URI enums; partial/unresolved lists are errors |
| `relevantRiepr` | URI references annotated with `x-reference-types`; runtime instances are supplied separately (synthetic example: `examples/refs.json`) |
| `conditionPath` / `conditionValue` | Typed, record/ancestor-scoped `if/then/else`; absent triggers do not activate fields, inactive values are prohibited |
| CSOR aspect/carrier/determination/variable | Preserved `x-kwantiteitsaspect`, `x-drager`, `x-soortwaardebepaling`, `x-variabele` and source-concept annotations |
| `related` | `x-related-concepts`; preserve distinct conditional variants, child identities, cardinalities and requiredness rather than merging equal labels |
| `_ui_first` / `_ui_after` | Sibling ordering, retained independently of machine identity |

Every source field retains `x-source-concept`. Source datatypes, code lists,
variable concepts and ordering concepts also retain their expanded identities.
Canonical data-property names derive from predicates, not translated labels;
source concept identities discriminate members/PropertyValues, not invented predicates.
The reporting envelope and explicit feature-construction inputs are exceptions,
not RDF assertions. Source-shaped presentation keys are not canonical JSON keys.
Independent repeated records cannot be joined implicitly by a condition.
The same URI-derived collision handling applies to root selectors and children.
`x-variable-location: {ancestorDepth,path}` resolves a selected substance from the
value field's owning object: ascend the given number of source object/record
levels, then follow the property-token path, including any `x-value-path` wrapper.
Same-record, ancestor and singleton-sibling contexts are supported; crossing an
independent array or selecting an ambiguous multivalue is an error. `x-variabele`
remains the selector's property name for compatibility, not a complete relative
path. These annotations are compiler output, not new source columns.
Missing leaf types, unresolved placeholders, ambiguous ownership, cycles,
invalid collection membership and numeric `NaN` conditions are explicit errors.

Reporting documents are closed, self-contained object trees. They do **not**
inherit a generic Observation envelope: a navigation context is not itself an
Observation. Section documents retain reporting context and their selected source
subtree. Generic observation/collection bases remain available, but contain no
live OGC/network references.

## Validation and selected SOSA profile

`SchemaValidator.validateInstance(schema, data, dependencies)` compiles the actual
schema with AJV 2020 and `ajv-formats`, offline. It returns precise instance/schema
paths. Invalid schemas and unresolved references throw configuration errors,
rather than returning an indistinguishable `false`. CLI generation compiles every
indexed schema with its explicit offline registry before publishing the index.

`SemanticValidator.validate(schema, data, {references, referenceContext})` runs
after structural validation. It checks the homogeneous profile selected from
[SSN Extensions, Working Draft 16 January 2020](https://www.w3.org/TR/2020/WD-vocab-ssn-ext-20200116/):
Observation or ObservationCollection members, at least one member, at most one
collection value for each of the seven shared properties, no collection-level
member result, and no conflicting descendant shared values. Only `hasMember`
propagates collection context; Sample/Sampling timestamps and provenance do not.
Conflicting entity definitions and unknown/wrongly typed/out-of-scope structural
references are errors. Reporting year and external parent context can be supplied
explicitly. `riepr:Observatie`/`ObservatieVerzameling` are application-profile
subclasses of SOSA Observation/ObservationCollection in the supplied RIE-IEPR
model, not equivalence assertions. `riepr:Resultaat` subclasses both
`sosa:Result` and `qb:Observation`. The compiler preserves that result class and
uses `qudt:hasUnit`, including in scalar RIE-IEPR observation results.

An explicit Resultaat group owns its children; the compiler does not hoist them
onto the outer observation. Peilmeting uses `qudt:numericValue`/`qudt:hasUnit` for
depth and `schema:measurementMethod` for method. Other result characteristics use
`schema:additionalProperty` with `schema:PropertyValue`: `schema:propertyID` is the
published field-concept URI, `schema:value` retains the typed/selected value, and
`schema:unitCode` retains the applicable unit URI. This avoids inventing domain
predicates. Generated `x-value-path` annotations identify wrapped scalar values
for generic conditional validation; they are not authored source columns.
Source conditions are read by their published SHACL predicates `sh:path` and
`sh:hasValue`, including singleton JSON-LD `@set` values.
These checks do not constitute full OWL or RDF Data Cube integrity validation.

The package exports these validators, the offline `SchemaRegistry`, types and
pointer helpers for the ODS POC. AJV and its format library are runtime
dependencies. Unit/integration tests generate schemas from explicit fixtures or
the tracked current source publication, never an old ignored `output/` directory.

## Deterministic output and provenance

`output/schema/index.json` lists exactly this snapshot's generated base, theme and section
files, their IDs/hashes and the canonical source fingerprint. Generation rejects
a stale synced JSON-LD file; run `npm run predev` after source regeneration.

A filtered run replaces the index, rather than merging old themes into it. Only
obsolete, previously indexed, unmodified files are removed. Unindexed files are
preserved but never discovered/synced as reporting sections. Failed generation
does not publish a new index.
Source compilation and offline schema validation happen before output files are
written. Older indexes without the optional generation report remain compatible;
new incomplete snapshots are explicitly marked and warn during ODS sync/use.

## Remaining work

The [14-workbook Teepak inventory](../poc-json-schema-ods/docs/TEEPAK_MAPPING.md)
is a historical review of the wider model, not the current groundwater contract.
Other operational CSVs, full Teepak coverage, feature construction and production
storage are outside the active scope. Future domain/source changes require MCP
dry runs, user approval and successful SKOS regeneration.

The UI already consumes these schemas and supports ODS downloads/imports.
Older multi-theme fixtures may still expect the removed theme-entry scheme;
their old section/blocker counts do not describe the active groundwater snapshot.
The [original project outline](docs/PROJECT_OUTLINE.md#historical-planning-notes-superseded)
retains the earlier design for context, not as implementation instructions.
