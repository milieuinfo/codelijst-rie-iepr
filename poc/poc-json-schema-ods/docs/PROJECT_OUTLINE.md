# Operational JSON Schema -> reversible ODS

## Current groundwater CSV profile

The active generator scope is groundwater only. It passes source-authored
`_table_workbook` and `_table_sheet` through the indexed JSON Schemas.
The ODS CLI uses those filenames; record tabs use those sheet names. Expected
workbooks are `grondwater-debieten.ods` (`Debieten`),
`grondwater-peilmetingen.ods` (`Peilmetingen`) and
`grondwater-kwaliteitsanalyses.ods` (`Monsters`, `Meetresultaten`), alongside the
context, lookup and hidden transport metadata tabs.

Each numeric quantity has `Eenheid` immediately to its right. A unit collection
becomes a dropdown backed by `Keuzelijsten`; fixed units retain their exact URI.
Headings preserve source labels, including `Labo naam`, while typed structural
objects such as the lab Agent remain in the imported JSON.

Workbooks with source-declared table metadata contain only business columns.
There are no row IDs, parent IDs, generic references, entity IDs, `propertyID`
or constant `observedProperty` columns, not even hidden ones. Machine mappings
remain in hidden metadata rows/the `_riepr` sheet, never in the JSON reporting
schema. Schema constants and shared timestamps are reconstructed on import.
The selectable `Parameter` remains a real input column.
As in Teepak, `Meetresultaten` starts with `Monster`, referencing `Monsternummer`
on `Monsters`. This business identifier must be filled and unique when linking
detail rows; ambiguous or missing references are errors, not guessed links.
Top-level `Debieten`, `Peilmetingen` and `Monsters` need no parent-reference column.

Hidden row 1 now contains a JSON Pointer template, e.g.
`/kwaliteitsmeting/*/hasMember/*`, instead of an opaque `@record:r_...` marker.
Hidden row 2 contains record-relative JSON Pointers such as
`/hasResult/numericValue`. The parent-reference column carries the target
identifier template `/kwaliteitsmeting/*/identifier`; its visible values remain
monsternummers. `*` denotes an array index in templates; concrete row pointers
in `_riepr` use actual indices, e.g. `/kwaliteitsmeting/0/hasMember/1`, with
`parentInstancePath: "/kwaliteitsmeting/0"`. The root pointer is the empty string.
Property tokens use RFC 6901 escaping (`~0`, `~1`).

Transport metadata version 2 includes `jsonMapping`: per-record path templates,
parent templates/identifier targets and column-ID-to-relative-pointer mappings.
Existing row snapshots also include `instancePath` and `parentInstancePath`.
The importer checks these mappings against the schema and rejects inconsistent
parent paths. Concrete pointers describe the original export; after sorting,
inserting or reparenting, current pointers are reconstructed from business links
and row order, not treated as immutable row IDs. Older workbooks must be
regenerated; their opaque mapping format is not silently interpreted as pointers.

Every populated generation is immediately imported and compared with its
materialized input JSON; any difference blocks output. CLI groundwater template
generation and UI download generation additionally perform this check with the
synthetic groundwater examples and their reference context. These dummy values
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
cell, so Calc does not shift a lookup range to another sheet. `Monster` is a live
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
npm --prefix poc/poc-json-schema run generate -- --theme Grondwater
npm --prefix poc/poc-json-schema-ods run predev
npm --prefix poc/poc-json-schema-ods run build
npm --prefix poc/poc-json-schema-ods run generate -- template --theme grondwater --references ../poc-json-schema/examples/refs.json --fetch-labels
```

The current CSV generates all three templates under `output/grondwater/`.
See the [generator's source contract](../../poc-json-schema/README.md#current-groundwater-csv-profile).
Groundwater tests cover the three layouts and populated round trips.

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

## Previous multi-theme profile (historical)

The remaining notes describe the earlier source model and legacy fixtures, not
the current active generation scope or current source completeness.

Eight approved sections support templates, populated exports and ODS imports:
the three groundwater sections, fuel, air emissions, normal/abnormal discharge,
and water self-control. Every array level gets an independently linked row set; singleton
Sample/Sampling/result details stay in their owning row. There are no
theme-specific generator branches or new authored layout columns.
Full coverage of the 14 reference workbooks is **not** complete; remaining domain
changes are listed in [the source review](./TEEPAK_MAPPING.md).

## Run

First install/build `poc-json-schema` and generate the supported source slice:

```bash
npm --prefix poc/poc-json-schema install
npm --prefix poc/poc-json-schema run predev
npm --prefix poc/poc-json-schema run build
npm --prefix poc/poc-json-schema run generate -- --theme Grondwater --section grondwater:kwaliteitsmeting

npm --prefix poc/poc-json-schema-ods install
npm --prefix poc/poc-json-schema-ods run predev
npm --prefix poc/poc-json-schema-ods run build
```

The ODS POC links the sibling schema package to reuse its offline structural and
semantic validators. Its build/test commands build that dependency first.

For debits, generate `--section grondwater:onttrekking` and use ODS section
`onttrekking`. The required reported volume and optional begin/end readings are
singleton observations inline in `Onttrekking infiltratie`, not three new sheets.
No volume calculation or mode switch is introduced. Period start/end values are
typed ODF dates or datetimes; the reporting period is not shared observation time.
For level measurements, use schema section `grondwater:peilmeting` and ODS
section `peilmeting`. The single `Peilmeting` sheet inlines the required Resultaat:
literal depth/unit, method and conditional PropertyValue components. Feature,
datetime and the required singleton reference point remain on the observation.
Property identifiers/units are constants; they do not create optional components
in empty templates or newly entered rows. Inactive-component errors identify the
entered value cell, not a constant identifier cell.
A filtered schema index replaces the previous snapshot. Omit schema `--section`
to generate all three groundwater sections together, or use separate snapshots.

Other working selections are schema `--theme Lucht --section lucht:brandstof`
or `lucht:emissie`, `--theme Water`, and `--theme "Zelfcontrole water"`.
ODS uses slugs `lucht/{brandstof,emissie}`, `water/{lozing,abnormale-lozing}` and
`zelfcontrole-water/meting`. Fuel's three observations inline on
`Verbruikte brandstof`; air pollutant observations get linked
`Verontreinigende stof of BKG` rows. Normal discharge's four member observations
and shared Procedure inline on `Lozing`. Water self-control lab details inline on
`Meting`, with linked `Parameter` rows and nested Resultaat columns.
Structural-reference arrays remain separate linked sheets, not multiline cells.

Source corrections are also applied to the remaining lists, but five TODO units,
the empty temporary material-code scheme, untyped contextual consumption fields
and the unreachable contextual step remain explicit blockers. The existing
Test-only frequency list is retained by user choice, not silently expanded.

To sync every currently usable section in one snapshot, run schema generation
with `npm --prefix poc/poc-json-schema run generate -- --allow-incomplete`,
then the ODS `predev` command. This explicit mode emits bases and valid sections,
not partial combined theme schemas. The index retains its structured
`generation.blockedSections` report; sync and all ODS CLI commands warn
`INCOMPLETE schema snapshot` when sections were blocked. Only indexed valid
sections are offered. Missing metadata is never patched or silently omitted
from an exported section. Completeness refers to the requested reachable scope,
not all code lists or full Teepak coverage. Invalid generation reports are errors;
older indexes without the optional report remain supported.

```bash
# Inspect the derived records, ancestry and exact column schema pointers.
npm --prefix poc/poc-json-schema-ods run generate -- plan --theme grondwater --section kwaliteitsmeting

# Reference IDs/labels/types are runtime structural instances, not new source concepts.
npm --prefix poc/poc-json-schema-ods run generate -- template --theme grondwater --section kwaliteitsmeting --references refs.json --out ./templates

npm --prefix poc/poc-json-schema-ods run generate -- export --theme grondwater --section kwaliteitsmeting --data report.json --references refs.json --out ./exports

npm --prefix poc/poc-json-schema-ods run generate -- import --theme grondwater --section kwaliteitsmeting --ods ./exports/grondwater/kwaliteitsmeting.ods --out ./report-imported.json

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
| Domain sheets | One row per repeated object; every nested array has its own sheet |
| Scalar/reference arrays | Linked value sheets, not lossy comma/multiline cells |
| Singleton objects | Inline columns, preserving object/empty-container presence |
| `Keuzelijsten` | Label/value/type mappings with standard ODF range validations |
| Hidden `_riepr` | Version, schema/source/plan fingerprints, lookup/reference snapshots, original row links |
| Hidden rows 1/2 | Record identity and stable column identities |
| Row 3 | Editable readable headers; names are not machine identifiers |
| Hidden first three columns | Transport row ID, parent ID, container presence |
| Visible reference columns | Readable row and parent references |

Technical row IDs are workbook-scoped and distinct from JSON-LD `@id`, published
concept URIs and business identifiers. Readable references use real
`dcterms:identifier`, `schema:identifier` or `rdfs:label` predicates, falling back
to technical references. Duplicate readable identifiers are disambiguated; no
new business uniqueness constraint is invented.

New rows do not require editing hidden columns. Fill business values and a visible
parent reference; for new parent records a declared business identifier can derive
the reference. Enter an explicit distinct visible reference when identifiers are
ambiguous. Top-level records have the unique cover/context as parent. Sorting
rows/reordering columns/renaming headers preserves ownership; worksheet order
determines array order within each parent.

Editing a visible parent reference intentionally reparents a row; unchanged
hidden links are reconciled against the original snapshot. Contradictory hidden
edits, duplicate IDs, ambiguous parents, orphans, missing metadata, unknown columns,
unexpected sheets and edited lookup mappings are errors. Delete a worksheet row
to remove that record; clearing required business values leaves an invalid record.

Cells carry real ODF number/boolean/date/time values. Strings preserve leading
zeros, whitespace and Unicode. Numeric values are not rounded before writing;
JSON numbers retain their JavaScript/IEEE-754 precision, not arbitrary-precision
decimal arithmetic. Unsafe integers are rejected. Numeric text accepts a decimal
point or comma, not thousands separators. Formula cells are unsupported.

Untouched template rows are ignored, including their prefilled constants.
Source-required record/reference arrays still apply: an entirely blank water
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

Regression coverage includes all eight actual-source round trips, extra synthetic
nesting, independent sibling arrays, empty records, duplicate labels, new rows,
sorting/reordered columns, typed values, conditions and failing CLI imports.
Generated representative XML was validated against the official OASIS ODF 1.3
schema. Office-application reopen/save compatibility remains unverified: the local
LibreOffice installation has core but **not Calc**. In particular, do not assume
timezone/number lexical preservation through an office application until that
separate check succeeds.
