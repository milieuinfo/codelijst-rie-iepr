# Operational JSON Schema -> reversible ODS

The Dutch [end-to-end guide](../../../README.md#van-csv-naar-json-schema-ui-en-ods)
explains the CSV interpretation and schema/UI/ODS mapping without implementation
details. This document describes the workbook contract and CLI operation.

## Current operational CSV profile

The active generator scope covers six themes and fourteen sections: groundwater,
annual air/water reporting, self-control for air/water and raw materials. It passes source-authored
`_table_workbook` and `_table_sheet` through the indexed JSON Schemas.
The ODS CLI uses those filenames; record tabs use those sheet names. Expected
workbooks are `grondwater-debieten.ods` (`Debieten`),
`grondwater-peilmetingen.ods` (`Peilmetingen`) and
`grondwater-kwaliteitsanalyses.ods` (`Monsters`, `Meetresultaten`), alongside the
context, lookup and hidden transport metadata tabs. Air adds `lucht-emissies.ods`
with `Emissiegehelen` and a repeated pollutant-result sheet. Detail rows repeat
the selected point and source set, without a new Emissie-ID. The pollutant sheet
currently uses its source label.
Materials add `lucht-brandstoffen.ods`, `lucht-verbruikte-stoffen.ods`,
`lucht-geproduceerde-stoffen.ods` and `lucht-afvalproducten.ods`, each with one
business sheet and no parent identifier. Installation is the first column;
singleton result fields stay inline in source-defined sibling order.
Composition and fuel sulfur/ash are optional. Fuel consumption is fixed GJ;
other quantities offer the shared seven-unit collection.
Emission-context material references and remaining annual pollutant fields
are not enabled.

Water adds `water-lozingen.ods`: `Waterstromen` holds annual flow/days per
control point, and `Stoffen in waterstromen` holds its repeated pollutant
collections, linked by the source-declared control-point key. Concentration,
annual load, integer measurement frequency and the procedure stay on each
pollutant row. `water-abnormale-lozingen.ods` has one `Abnormale lozingen` sheet.
The existing units and choices remain unchanged, including abnormal duration in
hours. Optional annual load and its unit remain absent when only duration is
reported. Nested collection class constants are hidden schema-derived values, not
editable columns or invented observed properties.
Water use, standalone method declarations, totals, balances and bundling
independent sections into one workbook are not covered.

Self-control adds `zelfcontrole-lucht.ods` and `zelfcontrole-water.ods`, each
with `Metingen` and `Meetresultaten`. Detail rows repeat the approved composite
key: point URI plus exact timestamp. Two measurements at the same point on the
same day remain distinct; changing the optional lab does not distinguish an
otherwise duplicate key. Point, timestamp and at least one parameter are required
within a supplied measurement; an entirely blank template imports as `{}`.
Lab names and registration numbers are metadata.
Optional concentration and mass flow are non-negative with selectable units;
water limit values also offer selectable units. Uncertainty is an optional
integer 0–100 percent. Frequency and its source are temporarily free text.
Water sample type offers three approved options. See the
[source guide](../../../README.md#zelfcontrole-lucht-en-water) for exact units,
Confluence deviations and remaining parameter/list gaps.

Raw materials add `grondstoffen-geproduceerd.ods` with
`Geproduceerde grondstoffen` and `Bestemmingen`. The latter repeats the material
code as its approved unique parent key per exploitation/year, compared by URI,
not the displayed label. Produced quantities use fixed ton and a non-negative
decimal. Destination types activate the original distinct Agent variants; their
identification columns remain separate, even where labels coincide.
`grondstoffen-inkomend.ods` has one `Inkomende grondstoffen` sheet with required
GPBV installation, Rubriek activity, nature and non-negative quantity in ton.
There is no installation-dependent activity filter. The 137 material-code choices
come from the 2024 Teepak reference; structural references are fictional shared
examples. Address remains text and produced precision 0.001 ton is documented,
not numerically enforced. See the [source guide](../../../README.md#grondstoffen).

Each numeric quantity has `Eenheid` immediately to its right. Optional quantities
do not prefill a fixed unit until a value is supplied. A unit collection
becomes a dropdown backed by `Keuzelijsten`; fixed units retain their exact URI.
Headings preserve source labels, including `Labo naam`, while typed structural
objects such as the lab Agent remain in the imported JSON.

Workbooks with source-declared table metadata contain only business columns.
There are no row IDs, parent IDs, generic references, entity IDs, `propertyID`
or constant `observedProperty` columns, not even hidden ones. Machine mappings
remain in hidden metadata rows/the `_riepr` sheet, never in the JSON reporting
schema. Schema constants and shared timestamps are reconstructed on import.
The selectable `Parameter` remains a real input column.
`Meetresultaten` starts with `Monsternummer`, repeating the existing field from
`Monsters`. The source explicitly declares it as the single component of
`_table_key`; air uses the same contract with point and source-set components.
This business identifier must be filled and unique when linking
detail rows; ambiguous or missing references are errors, not guessed links.
For records without an explicit `x-table-key`, existing identifier predicates
remain supported as a backwards-compatible fallback.
Top-level `Debieten`, `Peilmetingen` and `Monsters` need no parent-reference column.

Hidden row 1 contains a JSON Pointer-style path template, e.g.
`/kwaliteitsmeting/*/hasMember/*`, instead of an opaque `@record:r_...` marker.
Hidden row 2 contains record-relative JSON Pointers such as
`/hasResult/numericValue`. Singleton observation columns use JSONPath filters,
e.g. `$["hasMember"][?(@.observedProperty == "<concept URI>")]["hasResult"]["numericValue"]`,
because all observations share the canonical `hasMember` array. The filter
identifies an observation by concept instead of assuming an array index.
Depth and parameter analyses share that array despite their different sheets.
Additional-property columns similarly filter `additionalProperty` by `propertyID`.
Laboratory names map to `/wasAssociatedWith/label`. Reference points remain
ordinary selection cells; import wraps each selected value in its typed
PropertyValue with constant `propertyID`, without adding technical input columns.
The repeated key column carries `@parent-key:<source concept URI>`; its
`parentKeyPaths` mapping points to `/identifier` within the parent. Its visible
values remain monsternummers. `*` denotes an array index in templates; concrete row pointers
in `_riepr` use actual indices, e.g. `/kwaliteitsmeting/0/hasMember/1`, with
`parentInstancePath: "/kwaliteitsmeting/0"`. The root pointer is the empty string.
Property tokens use RFC 6901 escaping (`~0`, `~1`).
Wildcard templates are mapping patterns, not literal RFC 6901 Pointers until
their array indices have been substituted.

Transport metadata version 2 includes `jsonMapping`: per-record path templates,
parent templates/identifier targets, any source-declared parent-key component
paths, and column-ID-to-relative-path mappings. Each parent-key mapping names
the source concept and the exact parent-field JSON Pointer. Reference snapshots
preserve declared reference relations so dependency checks still run on import.
Existing row snapshots also include `instancePath` and `parentInstancePath`.
The importer checks these mappings against the schema and rejects inconsistent
parent paths. Concrete pointers describe the original export; after sorting,
inserting or reparenting, current pointers are reconstructed from business links
and row order, not treated as immutable row IDs. Older workbooks must be
regenerated; their opaque mapping format is not silently interpreted as pointers.

Every populated generation is immediately imported and compared with its
materialized input JSON after regrouping canonical predicate arrays by source
variant; any other difference blocks output. Order within repeated records of
the same variant is preserved. CLI template generation and UI download
generation additionally perform this check with the synthetic groundwater,
air, water, self-control and raw-material examples and their reference context. These dummy values
are used only in the verification workbook, never in the downloaded blank
template.

The importer also exposes a browser entry point shared with the operational UI.
Uploading a filled template validates the selected schema/source snapshot and
reporting year, reconstructs the JSON and inserts it as editable form data.
Workbook reference snapshots supply the corresponding demonstration labels.
An existing draft is replaced only after confirmation; failed imports do not
change it. Parsing, hashing and validation run locally, including on LAN HTTP,
without Node-only APIs or a server upload.

Scalar/reference arrays with a declared sheet stay inline in that sheet. Select
one choice from the dropdown, or enter a JSON array of displayed choices for
multiple values, e.g. `["Filter 1","Filter 2"]`. This preserves arrays (including
empty arrays), avoids lossy delimiter splitting, and rejects unknown choices.
Calc does not provide a native multiple-selection dropdown for one cell.
Multi-value cells therefore show an explanatory input hint and a confirmable
warning for manually entered JSON arrays, rather than blocking all multi-value
input. Other selections reject values outside their list. Boolean inputs offer
`Ja`/`Nee` and import as JSON booleans.
Arrays without declared table placement retain the previous linked-row behavior.

Dropdown formulas use absolute sheet/column/row references and an explicit base
cell, so Calc does not shift a lookup range to another sheet. `Monsternummer` is a live
dropdown over the `Monsternummer` input range on `Monsters`, including new rows.
Declared business sheets have 1000 additional formatted/validated input rows.
The Teepak-inspired presentation uses green (`#447A6D`) wrapped headers with bold
white text, 11pt Arial, 50pt header/20pt data rows, typed column widths and Dutch
date/datetime formats. Formatting does not change stored numeric precision or
the machine mappings; technical rows and metadata remain hidden.

Generate and sync the schema snapshot before using the ODS CLI:

```bash
npm --prefix poc/poc-json-schema run predev
npm --prefix poc/poc-json-schema run build
npm --prefix poc/poc-json-schema run generate
npm --prefix poc/poc-json-schema-ods run predev
npm --prefix poc/poc-json-schema-ods run build
npm --prefix poc/poc-json-schema-ods run generate -- template --theme grondwater --references ../poc-json-schema/examples/refs.json --fetch-labels
```

The groundwater command generates three templates under `output/grondwater/`.
Use `--theme lucht` in the ODS command to generate the air workbook under
`output/lucht/`.
Use `--theme water` for the two water workbooks under `output/water/`.
Use `--theme zelfcontrole-lucht` or `--theme zelfcontrole-water` for the
corresponding self-control workbook.
For populated synthetic examples, use `export --theme zelfcontrole-lucht --section meting
--data ../poc-json-schema/examples/zelfcontrole-lucht/meting.json
--references ../poc-json-schema/examples/refs.json
--reference-context ../poc-json-schema/examples/reference-context.json
--out output/examples --fetch-labels` (substitute `zelfcontrole-water` for water).
Blank discharge templates can be downloaded, but importing an entirely blank
`water-lozingen.ods` correctly fails the source's required-discharge constraint;
the optional abnormal-discharge workbook imports empty as `{}`.
See the [generator's source contract](../../poc-json-schema/README.md#current-operational-csv-profile).
Source-based tests cover all four layouts and populated round trips.

To export the synthetic input examples, use the same schema snapshot:

```bash
npm --prefix poc/poc-json-schema-ods run generate -- export \
  --theme grondwater --section onttrekking \
  --data ../poc-json-schema/examples/grondwater/onttrekking.json \
  --references ../poc-json-schema/examples/refs.json \
  --reference-context ../poc-json-schema/examples/reference-context.json \
  --out output/examples --fetch-labels
```

Replace `onttrekking` with `peilmeting` or `kwaliteitsmeting` in both places for
the other examples. These workbooks go to `output/examples/grondwater/`, keeping
the blank templates separate. Reference context is required because the
demonstration structural instances belong to reporting year 2024.

## CLI operations

### Reference enums from a personalized schema

The schema generator can publish `schema.json` and `schema.personalized.json`
side by side using `--references` and `--reference-context`; see the
[variant generation guide](../../poc-json-schema/README.md#generic-and-personalized-variants).
Sync that index as usual, then select the personal variant explicitly:

```bash
npm --prefix poc/poc-json-schema-ods run generate -- template --theme grondwater --personalized
npm --prefix poc/poc-json-schema-ods run generate -- export \
  --theme grondwater --section kwaliteitsmeting --personalized \
  --data ../poc-json-schema/examples/grondwater/kwaliteitsmeting.json --out output/examples
npm --prefix poc/poc-json-schema-ods run generate -- import \
  --theme grondwater --section kwaliteitsmeting --personalized \
  --ods output/examples/grondwater/grondwater-kwaliteitsanalyses.personalized.ods \
  --out output/examples/kwaliteitsmeting.personalized.json
```

`--personalized` applies to plan/template/export/import and fails if the indexed
generic section has no corresponding personal variant. It does not duplicate
the section selection. Generic operation remains the default.
Personal ODS filenames end in `.personalized.ods`, preserving generic outputs.
Embedded reference enums drive dropdown values; snapshot references provide
their labels, types, year and parent context without a separate `--references`
file. Ordinary code-list labels can still be enriched with `--fetch-labels`.
An empty permitted reference set is an explicit generation error, not free text.

Personal groundwater templates still run populated round-trip checks. The
default examples must be valid for that personal snapshot. For different
organization references, pass `template --data <synthetic-validation.json>` to
provide compatible dummy data; it is used only for the separate verification
workbook, and the emitted template remains blank. Supplied context must match
the personal schema's snapshot. A matching personal schema/plan is also required
on import: fingerprints are not interchangeable with generic workbooks.
The UI's standard ODS download/import remains on the generic transport contract;
its personal JSON schema download follows the current browser reference context.

### General commands

The ODS POC links the sibling schema package to reuse its offline structural and
semantic validators. Its build/test commands build that dependency first.

For debits, use ODS section `onttrekking`; for level measurements, `peilmeting`.
Their singleton observation/result details remain inline in `Debieten` and
`Peilmetingen`. Quality depth stays on `Monsters`; only repeated parameter
observations use `Meetresultaten`. A singleton Monster and Sampling remain inline
on the `Monsters` sheet; no quantity is calculated. Source-declared resultTime ownership,
including the shared end date for quantity/end reading, remains intact.
Hidden constants do not create optional components in otherwise empty rows.
Inactive-component errors identify the entered value cell, not an identifier.

A filtered schema index replaces the previous snapshot. Omit schema `--section`
to generate all three groundwater sections together, or use separate snapshots.

Other operational CSVs are not part of active generation. The wider
[Teepak source review](./TEEPAK_MAPPING.md) and multi-theme fixtures are historical;
their section counts and Sample/Sampling layouts do not describe groundwater.

```bash
# Inspect the derived records, ancestry and exact column schema pointers.
npm --prefix poc/poc-json-schema-ods run generate -- plan --theme grondwater --section kwaliteitsmeting

# Reference IDs/labels/types are runtime structural instances, not new source concepts.
npm --prefix poc/poc-json-schema-ods run generate -- template --theme grondwater --section kwaliteitsmeting --references refs.json --out ./templates

npm --prefix poc/poc-json-schema-ods run generate -- export --theme grondwater --section kwaliteitsmeting --data report.json --references refs.json --out ./exports

npm --prefix poc/poc-json-schema-ods run generate -- import --theme grondwater --section kwaliteitsmeting --ods ./exports/grondwater/grondwater-kwaliteitsanalyses.ods --out ./report-imported.json

npm --prefix poc/poc-json-schema-ods test
```

Paths are relative to the process working directory. Export/template `--out`
names a directory; import `--out` names the JSON file. `--input-dir` selects an
independently synced snapshot. Themes are indexed machine slugs; `--section`
accepts the indexed section slug or schema ID. Export/import require one section;
templates/plans can cover multiple indexed sections. `--dry-run` prints the plan.

Reference input:

```json
[
  {
    "id": "urn:example:filter:1",
    "label": "Filter 1",
    "types": ["https://data.omgeving.vlaanderen.be/id/concept/riepr/filtertype/peil"],
    "parents": ["urn:example:site:1"],
    "year": 2024
  }
]
```

Each referenced structural-property value also needs its own entry with the type
declared by the field's `x-reference-types`. Optional `parents` and `year` scope
choices; `--reference-context context.json` can supply
`{"year":2024,"ids":["urn:example:site:1"]}`. Selected references in the same or
ancestor records also supply parent context. Imports retain the reference snapshot
and context in metadata, or can revalidate against explicitly supplied current
reference data. Choices from other years/unselected parents are rejected.

Example (synthetic ids) that generates the `peilmeting` template, which needs one
filter and one referentiepunt reference:

```json
[
  { "id": "urn:example:filter:1", "label": "Filter 1",
    "types": ["https://data.omgeving.vlaanderen.be/id/concept/riepr/filtertype/peil"], "year": 2024 },
  { "id": "urn:example:referentiepunt:1", "label": "Maaiveld",
    "types": ["https://data.omgeving.vlaanderen.be/id/concept/riepr/meetpunteigenschappen/referentiepunt"], "year": 2024 }
]
```

```bash
npm --prefix poc/poc-json-schema-ods run generate -- template --theme grondwater --section peilmeting --references refs.json --out ./templates
```

Without `--references`, sections whose fields declare `x-reference-types` fail with
`Reference data is required`. A batch run (no `--theme`/`--section`) continues past
such sections, prints `Failed <section>: ...` for each, and exits 1 at the end.

By default generation refuses an incomplete schema index (`generation.complete: false`).
`--allow-incomplete` generates the indexed valid sections anyway and keeps the
`INCOMPLETE schema snapshot` warning; it applies to template, plan, export and import.

Local concept labels come from the synced code list. `--fetch-labels` explicitly
requests published CSOR labels/symbols (using `CSOR_SPARQL_ENDPOINT`); network
failures are errors. Without it, unavailable labels produce a warning, but all URI
mappings remain intact. The API also accepts a label resolver. Duplicate labels
are disambiguated rather than mapped to the first match.

## Workbook contract

| Surface | Representation |
|---|---|
| Workbook boundary | One indexed reporting section, independent of instance count |
| `Voorblad` | One root-context row; unlike Teepak's key/value cover |
| Domain sheets | One row per presentation record; repeated object details have linked sheets, singleton members stay inline |
| Scalar/reference arrays | In a declared business sheet: one selection cell with optional JSON array; otherwise generic linked value sheets |
| Singleton objects | Inline columns, preserving object/empty-container presence |
| `Keuzelijsten` | Label/value/type mappings with standard ODF range validations |
| Hidden `_riepr` | Version, schema/source/plan fingerprints, lookup/reference snapshots, original row links |
| Hidden rows 1/2 | JSON record-path templates and relative column mappings |
| Row 3 | Editable readable headers; names are not machine identifiers |
| Business-layout columns | No technical IDs; repeated source key fields or, absent those, a declared business parent reference |
| Generic-layout columns | Hidden transport IDs/container presence; source-key links show repeated parent fields instead of a visible parent-reference field |

The following transport-ID behavior applies only to schemas **without**
source-declared workbook layout. Groundwater uses the business layout and
JSON-path metadata described above; its monsternummers must be unambiguous.
Technical row IDs are workbook-scoped and distinct from JSON-LD `@id`, published
concept URIs and business identifiers. Readable references use real
`dcterms:identifier`, `schema:identifier` or `rdfs:label` predicates, falling back
to technical references. Duplicate readable identifiers are disambiguated; no
new business uniqueness constraint is invented.

New rows do not require editing hidden columns. Fill business values and a visible
parent reference; for new parent records a declared business identifier can derive
the reference. Enter an explicit distinct visible reference when identifiers are
ambiguous. If the owning repeated record declares `x-table-key` as source concept
URIs, the child sheet instead repeats those key fields, with the parent's labels
and choice validation. Key values are matched by decoded JSON type and URI/value,
not by displayed labels. Scalar arrays are unordered sets for key matching and
duplicate elements are rejected. Empty key components, duplicate parent keys,
and orphan/ambiguous child keys are errors. The repeated fields are transport
columns only: they are not added to the nested JSON child record. Without
`x-table-key`, existing identifier/visible-reference linking is unchanged.
Top-level records have the unique cover/context as parent. Sorting rows,
inserting rows, reordering columns or renaming headers preserves ownership;
worksheet order determines array order within each parent.

Editing a visible parent reference or a repeated key intentionally reparents a row;
unchanged generic hidden links are reconciled against the original snapshot.
Contradictory hidden edits, duplicate IDs, ambiguous parents, orphans, missing
metadata, unknown columns, unexpected sheets and edited lookup mappings are errors.
Delete a worksheet row to remove that record; clearing required business values
leaves an invalid record.

Cells carry real ODF number/boolean/date/time values. Strings preserve leading
zeros, whitespace and Unicode. Numeric values are not rounded before writing;
JSON numbers retain their JavaScript/IEEE-754 precision, not arbitrary-precision
decimal arithmetic. Unsafe integers are rejected. Numeric text accepts a decimal
point or comma, not thousands separators. Formula cells are unsupported.

Untouched template rows are ignored, including their prefilled constants.
Source-required record/reference arrays still apply: an entirely blank required
template is incomplete and is rejected, not returned as successful empty data.
Zero/false and typed empty strings are not blanks. Optional absent objects remain
absent; explicitly empty containers round-trip. Constants are restored only
inside present/required containers. Inactive conditional values cause cell-level
errors and are never silently discarded.

Import validates relationships, then the **actual** generated schema/formats and
homogeneous SOSA profile using the shared validator. Errors include sheet, row,
column and instance/schema paths where applicable. Failed import writes no JSON.
Unversioned legacy Teepak templates are comparison material, not import inputs.

## Planner, provenance and limits

`compileTabularPlan` replaces the lossy flattener/first-array splitter. It retains
record-local paths, full array ancestry and exact escaped schema JSON Pointers
(plus document ID). It supports explicit offline `$ref` resources, closed object
trees, scalar arrays, nested arrays, fixed layouts with conditional constraints,
and deterministic sibling order/sheet-name collision handling. Unsupported
alternative/open-ended/structural-composition layouts and infinitely recursive
record definitions fail explicitly instead of dropping fields.

Sync/discovery uses only `schema/index.json`. Every source/schema hash is checked
before sync/generation/import; stale inputs are errors. Cleanup is restricted to
previously indexed, unmodified files. Retained legacy/unindexed files cannot
create workbooks.

Current groundwater coverage includes all three populated examples,
discriminator-specific required fields, hidden JSON mappings, multi-reference
PropertyValues and dummy-data checks for blank templates. Synthetic coverage
also includes nesting, independent sibling arrays, empty records, duplicate labels, new rows,
sorting/reordered columns, typed values, conditions and failing CLI imports.
Generated representative XML was validated against the official OASIS ODF 1.3
schema. Office-application reopen/save compatibility remains unverified: the local
LibreOffice installation has core but **not Calc**. In particular, do not assume
timezone/number lexical preservation through an office application until that
separate check succeeds.
