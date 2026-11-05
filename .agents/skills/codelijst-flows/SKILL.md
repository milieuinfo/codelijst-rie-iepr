---
name: codelijst-flows
description: 'View, explain, add, edit or delete the operationele gegevens of RIE-IEPR: the thematische stromen (thematypes.csv) and their steps and fields in operationeel_*.csv, including the form/UI they produce (controls, order, conditions, repeatable groups, next steps). Use for questions like "hoe ziet de flow voor lucht eruit?", "welke velden moet ik invullen bij grondwater?", "voeg een veld toe aan de stap rapportering", "zet volume voor eindtoestand", "maak een nieuwe stroom voor afval", "verwijder de stap emissie".'
---

# Operationele flows: view, explain and change

Use the `codelijst-rie-iepr` MCP server tools; do not edit `thematypes.csv` or `operationeel_*.csv` by hand.

## How a flow works

- A **thema** (`thematypes.csv`, e.g. `thema:lucht`) starts a flow: its `vervolgstap` is the first **step**.
- A step is a `skos:ConceptScheme` in an `operationeel_*.csv`; its concepts are the **fields** of that screen.
- A field with `vervolgstap` leads to the **next step** once it is filled in (typically a picker of the system to report on).
- `broaderPartitive` makes a field a **part** of a composite field (a group); `isMeervoudig` makes it repeatable.
- `conditionPath`/`conditionValue` show a field only when another field of the step has that value.
- `related` lists alternative **variants** of one logical field (shown as one group, the active variant follows the condition).
- `_ui_first`/`_ui_after` set the **order** among siblings; conditional fields are always shown after their trigger.
- A value about a stof (concentratie, jaarvracht, ...) carries `kwantiteitsAspect` (`csor_kwantificeerbaaraspect:`), `drager` (`csor_drager:`, e.g. DR_1 water, DR_8 lucht), `soortWaartbepaling` (`csor_soortwaardebepaling:`, usually SWB_1 standaard) and `variabele`: the field where the stof is selected (whose `relevantCodeList` is a collection of CSOR variabelen). It may belong to the same record or an ancestor/singleton context; never cross an independent repeated group.
- `relevantDataType` → input control, `relevantCodeList` → select, `relevantRiepr` → picker of systems (with `relevantClass sosa:FeatureOfInterest`: the system the report is about), `relevantUnit` → unit, `minValue`/`maxValue` → allowed range of a numeric field (`xsd:decimal`/`xsd:integer` only).

## Reporting-schema and ODS consumers

The JSON Schema/ODS POCs preserve this ownership tree; do not add presentation
columns or use false semantic classes to force worksheet boundaries. Every
repeatable group becomes a linked row set; singleton Sample/Sampling/result
details stay inline. Existing identifier predicates provide readable references.
Declare leaf datatypes and real units explicitly. A numeric `NaN` condition is
not missingness: resolve the business choice before changing its source rows.

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

Explain flows in the user's language (usually Dutch) with labels, step by step: what the user selects, what appears next, which fields are required/repeatable, and when conditional fields appear. For UI questions use the `control` values and the `legend` of `get_step` (they mirror the POC with @domg-wc components). Mention `issues` (e.g. `http://TODO` placeholders, fields with nothing to fill in).

## Changing

| Change | Tool |
|---|---|
| New thematische stroom (thema + file + first step) | `add_flow` |
| New step, linked from a field | `add_step` with `from` |
| New field / part of a group | `add_field` (with `parent` for a part) |
| New collection of CSOR concepts (e.g. stoffen) for a field, in `operationeel_misc.csv` | `add_flow_collection` |
| Change a field, step label or thema | `update_flow_item` (only keys in `set`; `null` clears) |
| Change the order of fields | `reorder_fields` |
| Delete a field (with its parts) / a step | `delete_field` / `delete_step` |

1. Look first (`get_flow`/`get_step`) and propose the change in terms of the form: which control, where it appears, when it is visible.
2. Ask what you cannot derive: label, datatype or list to choose from (published list or a new one: new option lists for flows live in `operationeel_misc.csv`), unit (CSOR code), required/repeatable, condition.
3. Run the tool with `dryRun: true`, show the lines, and after confirmation repeat with `dryRun: false`. Every write runs `npm run generate_skos` and is rolled back when that fails.
4. Deletes are refused while something still uses the item (e.g. a field used as `conditionPath`); the error lists the rows. `delete_step` only removes `vervolgstap` links to the step with `unlink: true`. Deleted concepts are published as withdrawn; ids cannot be renamed.
5. Afterwards run `validate_flows` and show the new `get_flow` outline.
