# Code lists -> operational JSON Schema

Compile the groundwater CSV into JSON Schema Draft 2020-12, shared by the UI and
ODS consumers.

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
| Non-SOSA characteristics of an Observation | Inside its implicit Resultaat, retaining declared predicates (otherwise the source concept URI) |
| `relevantUnit` | Fixed unit or expanded unit-collection choices, never a collection URI used as a unit |

The active reporting schemas do not add synthetic entity `@id` fields or ODS
row/link fields. They retain only source fields, necessary semantic structure,
units and declared constants; the ODS consumer does not turn machine constants
into input columns.

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

## Previous multi-theme profile (historical)

The following describes the earlier published model and its regression fixtures,
not the active CSV entry-point/scope or the current source's completeness.

### Supported sections

The approved groundwater **kwaliteitsmeting**, **onttrekking** and **peilmeting** compile and
round-trip through the [ODS POC](../poc-json-schema-ods/docs/PROJECT_OUTLINE.md).
One kwaliteitsmeting is one monster's analysis collection: a singleton Sample,
its singleton Sampling, and repeated parameter Observations. There is no
additional repeated monster layer. Onttrekking contains a required reported-volume
observation and optional begin/end-reading observations, with no calculation or
input-mode switch. Its reporting period is not a shared observation timestamp.
Peilmeting is one Observation with a required singleton reference point and a
source-owned Resultaat containing depth, method and conditional pump-state details.
The same source-owned Resultaat pattern now covers the other operational lists:

| Theme | Working source sections |
|---|---|
| Grondwater | `grondwater:kwaliteitsmeting`, `grondwater:onttrekking`, `grondwater:peilmeting` |
| Lucht | `lucht:brandstof`, `lucht:emissie` |
| Water | `water:lozing`, `water:abnormale-lozing` |
| Zelfcontrole water | `zelfcontrole-water:meting` |

Fuel and normal discharge retain their collection classes and distinct scalar
member Observations. Air emissions are explicitly reachable. Self-control
parameter values live inside Resultaat, with lab/parameter groups under their
measurement. Five unresolved unit references still block air substances/waste,
air self-control and materials. The new temporary material-code scheme is
deliberately empty and also blocks compilation. Contextual production volume
compiles in isolation as an integer Observation/Resultaat, but its step remains
unreachable and its three consumption stubs untyped. Full-repository generation
therefore still fails explicitly by default; no invented choices or units bypass these gaps.

```bash
npm install
npm run predev
npm run build
npm run generate -- --theme Grondwater --section grondwater:kwaliteitsmeting
npm test
```

`--out <directory>` creates an independent snapshot. `--section` requires
`--theme` and accepts the published source concept's CURIE or full IRI. It must
identify a top-level reporting record, not a nested field or structural picker.
Omit it to compile all reachable reporting sections, provided their source
metadata is complete. `--theme` uses the theme's display label.
Use `--section grondwater:onttrekking` or `--section grondwater:peilmeting` for
the other groundwater slices. Omit `--section` to generate all three together.
Filtered snapshots contain only the selected section.
For example, `--theme Lucht --section lucht:emissie` generates the air-emission
slice without including the unresolved material-quantity sections.

To generate all currently usable sections without resolving deferred source facts:

```bash
npm run generate -- --allow-incomplete
```

This explicit mode discovers reachable reporting sections and compiles each
independently. It emits bases and valid section schemas, **not combined theme
schemas**, and reports every blocked section to stderr and
`output/schema/index.json` under `generation.blockedSections`. Diagnostics include
the section/field source identities, issue codes and messages. The current source
produces eight sections and five blocked sections; materials reports both its
TODO unit and empty code list. No field is silently dropped from a valid section.

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
| `vervolgstap` (`qb:codeList`) | Explicit reachable step graph, including branch edges; no name/sub-string discovery |
| `broaderPartitive` | Object ownership; a relation never promotes a child out of its owner |
| `isMeervoudig` / `isMultiselect` | Distinct record arrays / value-reference arrays, at every depth |
| `relevantClass` / `relation` | `x-jsonld-type` / `x-jsonld-id`; preserve Sample, Sampling, agents and supporting records |
| Integer, decimal, boolean | Real JSON integer, number, boolean values |
| Date, datetime, duration | Strings with enforced `date`, `date-time`, `duration` formats |
| `dcterms:temporal` | `{start,end}`, either both dates or both datetimes |
| `relevantUnit` | Local `{numericValue,hasUnit}`; on a literal `qudt:numericValue`, `hasUnit` belongs to its owning object |
| `schema:PropertyValue` leaf | `{propertyID,value,unitCode?}`; published field URI identifies the property, constraints/references/formats stay on `value` |
| Scalar Observation | Reconstructible object with observed property and result, not a new unrelated array |
| Numeric `riepr:Observatie` | Typed `riepr:Resultaat` with `numericValue`, including when no unit is declared; no unit is guessed |
| `relevantCodeList` | Full URI enums; partial/unresolved lists are errors |
| `relevantRiepr` | URI references annotated with `x-reference-types`; runtime instances are supplied separately (synthetic example: `examples/refs.json`) |
| `conditionPath` / `conditionValue` | Typed, record/ancestor-scoped `if/then/else`; absent triggers do not activate fields, inactive values are prohibited |
| CSOR aspect/carrier/determination/variable | Preserved `x-kwantiteitsaspect`, `x-drager`, `x-soortwaardebepaling`, `x-variabele` and source-concept annotations |
| `related` | `x-related-concepts`; preserve distinct conditional variants, child identities, cardinalities and requiredness rather than merging equal labels |
| `_ui_first` / `_ui_after` | Sibling ordering, retained independently of machine identity |

Every source field retains `x-source-concept`. Source datatypes, code lists,
variable concepts and ordering concepts also retain their expanded identities.
Machine property names derive from source/predicate URIs, not translated labels.
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
records missing facts, source corrections and presentation differences. All
remaining domain changes require MCP dry runs and user approval, especially debit
type/spui coverage, missing level-measurement facts, TODO units/lists,
missing reporting groups and shared water-use facts. The user-approved destination
contract keeps each source variant as a separate conditional property; future UI
consumers can use `x-related-concepts` to present one logical selector/group.
The operational UI is not migrated, and full Teepak coverage is not yet implemented.
