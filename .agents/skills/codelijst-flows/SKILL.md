---
name: codelijst-flows
description: 'View, explain, add, edit or delete the operationele gegevens of RIE-IEPR: reporting entries and rapporteringsonderdelen, thematic navigation (thematypes.csv) and fields in operationeel_*.csv, including JSON Schema/UI/ODS readiness, controls, order, conditions, repeatable groups and next steps. Use for questions like "hoe ziet de flow voor lucht eruit?", "welke velden moet ik invullen bij grondwater?", "voeg een veld toe aan de stap rapportering", "zet volume voor eindtoestand", "maak een nieuwe stroom voor afval", "verwijder de stap emissie".'
---

# Operationele flows: view, explain and change

Use the `codelijst-rie-iepr` MCP server tools; do not edit `thematypes.csv` or `operationeel_*.csv` by hand.

## How a flow works

- A **navigation flow** can start at a thema (`thematypes.csv`): its `vervolgstap` is the first step. This is separate from active reporting.
- The current schema/UI/ODS profile declares **direct reporting entries** in `poc/reporting-entries.json`, shared by the snapshot generator and MCP. They do not require a thema or navigation link. An entry declares availability for compilation, not proven reporting readiness.
- A step is a `skos:ConceptScheme` in an `operationeel_*.csv`; its concepts describe source fields. Top-level reporting groups become **rapporteringsonderdelen** in the generated UI; one scheme need not equal one screen or workbook.
- A field with `vervolgstap` declares navigation to another step. It does not create data ownership, connected-system filtering or a reporting entry.
- `broaderPartitive` makes a field a **part** of a composite field (a group); `isMeervoudig` makes it repeatable.
- `conditionPath`/`conditionValue` show a field only when another field of the step has that value.
- `related` links alternative variants; the generated schemas retain distinct conditional properties with `x-related-concepts`. Do not merge children by label.
- `_ui_first`/`_ui_after` set the **order** among siblings; conditional fields are always shown after their trigger.
- A value about a stof (concentratie, jaarvracht, ...) carries `kwantiteitsAspect` (`csor_kwantificeerbaaraspect:`), `drager` (`csor_drager:`, e.g. DR_1 water, DR_8 lucht), `soortWaartbepaling` (`csor_soortwaardebepaling:`, usually SWB_1 standaard) and `variabele`: the field where the stof is selected (whose `relevantCodeList` is a collection of CSOR variabelen). It may belong to the same record or an ancestor/singleton context; never cross an independent repeated group.
- `relevantDataType` → input control, `relevantCodeList` → select, `relevantRiepr` → picker of systems (with `relevantClass sosa:FeatureOfInterest`: the system the report is about), `relevantUnit` → unit, `minValue`/`maxValue` → allowed range of a numeric field (`xsd:decimal`/`xsd:integer` only).
- CSOR labels/symbols in MCP descriptions come from the same generated published-label snapshot as the UI. Missing labels are reported; refresh with `sync:csor` rather than guessing meanings from codes. The published concept IDs remain unchanged.
- `referenceParent` + `referenceRelation` explicitly constrain a structural selection to candidates connected to the selected parent field through that predicate. Real connections come from reference snapshots (`relations`), never from `vervolgstap` or guessed field names.
- `tableKey` (`_table_key` in CSV) declares existing child field concepts as a composite ODS parent key. Detail sheets repeat these values; reporting JSON stays nested without a new ID. URI identity and unordered multiselect sets determine matches. Do not assume point/source combinations are unique without business approval.
- `tableWorkbook`/`tableSheet` write `_table_workbook`/`_table_sheet`: declare the filename and business sheet on the reporting group. They are presentation metadata, not semantic ownership. Standalone sheets do not need a parent key merely to exist.

## Reporting-schema and ODS consumers

The JSON Schema/ODS POCs preserve this ownership tree; do not add presentation
columns or use false semantic classes to force worksheet boundaries. Every
repeatable group becomes a linked row set; singleton Sample/Sampling/result
details stay inline. Existing identifier predicates provide readable references.
Declare leaf datatypes and real units explicitly. A numeric `NaN` condition is
not missingness: resolve the business choice before changing its source rows.
First establish the reporting grain (per installation, emission point/source set,
sample or parameter result). Installation-wide annual materials stay separate
from emission groups; never duplicate them under every emission for UI convenience.
Unit collections expand to actual selectable CSOR units, not a collection URI
stored as the selected unit. Ask the user which units and whether percentages/
composition are optional; do not infer these from blank spreadsheet cells alone.

The selected homogeneous collection profile is the SSN Extensions Working Draft
of 16 January 2020: `sosa:hasMember` targets Observations or nested
ObservationCollections, never physical Samples. Shared collection feature/time/
procedure properties are single-valued and must agree with descendants; results
belong to member observations. Sampling provenance/time is not collection-shared
observation context. The supplied RIE-IEPR model declares
`riepr:Observatie`/`ObservatieVerzameling` as SOSA subclasses, not equivalents.
`riepr:Resultaat` subclasses `sosa:Result` and `qb:Observation`: its result
characteristics belong inside the source-owned Resultaat, not on the outer
Observation. Use `qudt:numericValue`/`qudt:hasUnit` for its numeric value/unit.
For characteristics without an appropriate specific predicate, the approved
`schema:additionalProperty`/`schema:PropertyValue` pattern derives `propertyID`
from the field concept and preserves its datatype/choices in `schema:value`.
Numeric scalar `riepr:Observatie` members also get a typed Resultaat when no unit
is declared; do not guess a unit from the label. Standard-property selectors stay
on their Observation, outside Resultaat. Related source variants remain distinct
conditional JSON properties with `x-related-concepts`; the POC no longer merges
their children by label or invents cross-parent ordering links.

The approved groundwater model is **one kwaliteitsmeting per monster**:
singleton Sample -> singleton Sampling, with repeated parameter Observations
under the kwaliteitsmeting. Do not add a repeated Monsteranalyses layer.
See the POC READMEs/source review for supported sections and remaining gaps.

## Viewing

| Question | Tool |
|---|---|
| Which flows exist, and their steps? | `list_flows` |
| What does the flow for X look like? | `get_flow` and show its `outline` |
| Which fields/controls does one screen have? | `get_step` |
| Details of one thema, step, field or option, and who uses it | `get_flow_item` |
| Where is a term used? | `search_codelists` with `kind: 'operational'` |
| Problems (unreachable steps, broken references, placeholders) | `validate_flows` |
| Can active sections generate schemas/templates, and which flattened columns and parent keys result? | `get_reporting_preview` (optional `flow`, `section`) |

Explain flows in the user's language (usually Dutch) with labels, step by step: what the user selects, what appears next, which fields are required/repeatable, and when conditional fields appear. For UI questions use the `control` values and the `legend` of `get_step` (they mirror the POC with @domg-wc components). Mention `issues` (e.g. `http://TODO` placeholders, fields with nothing to fill in).
The MCP field outline describes the source model, not an exact rendered table:
singleton result containers are flattened by consumers. Distinguish navigation
reachability, declared reporting entries and successfully generated UI sections.

## Changing

| Change | Tool |
|---|---|
| New thematische stroom (thema + file + first step) | `add_flow` |
| New step, linked from a field | `add_step` with `from` |
| New field / part of a group | `add_field` (with `parent` for a part) |
| New collection of CSOR concepts (e.g. stoffen) for a field, in `operationeel_misc.csv` | `add_flow_collection` |
| Change a field, step label or thema | `update_flow_item` (only keys in `set`; `null` clears) |
| Move an existing field/group and all its parts to another step/group in the same CSV, preserving published ids | `move_field` (`field`, target `step`, optional target `parent`); broken dependencies block the move |
| Change the order of fields | `reorder_fields` |
| Coherent sequence of field additions/updates/moves/reordering and collection changes | `apply_operational_batch` (`operations`, each `{tool, args}`; one outer `dryRun`) |
| Delete a field (with its parts) / a step | `delete_field` / `delete_step` |

1. Look first (`get_flow`/`get_step`) and propose the change in terms of the form: which control, where it appears, when it is visible.
2. Ask what you cannot derive: label, datatype or list to choose from (published list or a new one: new option lists for flows live in `operationeel_misc.csv`), unit (CSOR code), required/repeatable, condition.
3. Run the tool with `dryRun: true`, show the lines, and after confirmation repeat with `dryRun: false`. Every write runs `npm run generate_skos` and is rolled back when that fails.
   For a coherent multi-edit change, prefer `apply_operational_batch`: later operations see earlier staged edits, and each must pass its usual checks. Show the final `removedLines`/`resultingLines`, not intermediate values. One approved batch runs one CSV fix and one SKOS validation; failures restore the entire batch. Deletions and new flow/profile configuration are intentionally excluded; they keep their separate approval workflows.
4. Deletes are refused while something still uses the item (e.g. a field used as `conditionPath`); the error lists the rows. `delete_step` only removes `vervolgstap` links to the step with `unlink: true`. Deleted concepts are published as withdrawn; ids cannot be renamed.
5. Afterwards run `validate_flows` and show the new `get_flow` outline. Its source checks and successful SKOS publication do not prove JSON Schema or ODS readiness. For active sections, use `get_reporting_preview`: it calls the actual compilers and generates blank templates in memory, reporting failures by stage. It does not certify populated round-trips or full business coverage.
6. For active reporting changes, regenerate the JSON Schemas strictly (without `--allow-incomplete`), sync both ODS and UI consumers, and verify the affected section's controls, flattened column order, units, optional/required fields and conditions. Check populated and blank ODS round-trips; preserve zero/false and optional absence. Keep all active themes indexed unless a filtered snapshot was explicitly requested. Commands live in the POC READMEs.
7. UI choices and downloadable templates share `poc/poc-json-schema/examples/refs.json`. Do not invent extra UI-only reference instances or joins; after changing examples regenerate personalized schemas and templates and check identity/label parity. This is consumer demonstration data, not a codelist.
