---
name: codelijst-flows
description: 'View, explain, add, edit or delete the operationele gegevens of RIE-IEPR: the thematische stromen (thema_type.csv) and their steps and fields in operationeel_*.csv, including the form/UI they produce (controls, order, conditions, repeatable groups, next steps). Use for questions like "hoe ziet de flow voor lucht eruit?", "welke velden moet ik invullen bij grondwater?", "voeg een veld toe aan de stap rapportering", "zet volume voor eindtoestand", "maak een nieuwe stroom voor afval", "verwijder de stap emissie".'
---

# Operationele flows: view, explain and change

Use the `codelijst-rie-iepr` MCP server tools; do not edit `thema_type.csv` or `operationeel_*.csv` by hand.

## How a flow works

- A **thema** (`thema_type.csv`, e.g. `thema:lucht`) starts a flow: its `seeAlso` is the first **step**.
- A step is a `skos:ConceptScheme` in an `operationeel_*.csv`; its concepts are the **fields** of that screen.
- A field with `seeAlso` leads to the **next step** once it is filled in (typically a picker of the system to report on).
- `broaderPartitive` makes a field a **part** of a composite field (a group); `isMeervoudig` makes it repeatable.
- `conditionPath`/`conditionValue` show a field only when another field of the step has that value.
- `related` lists alternative **variants** of one logical field (shown as one group, the active variant follows the condition).
- `_ui_first`/`_ui_after` set the **order** among siblings; conditional fields are always shown after their trigger.
- `relevantDataType` → input control, `relevantCodeList` → select, `relevantRiepr` → picker of systems (with `relevantClass sosa:FeatureOfInterest`: the system the report is about), `relevantUnit` → unit.

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
| Change a field, step label or thema | `update_flow_item` (only keys in `set`; `null` clears) |
| Change the order of fields | `reorder_fields` |
| Delete a field (with its parts) / a step | `delete_field` / `delete_step` |

1. Look first (`get_flow`/`get_step`) and propose the change in terms of the form: which control, where it appears, when it is visible.
2. Ask what you cannot derive: label, datatype or list to choose from (published list or a new one: new option lists for flows live in `operationeel_misc.csv`), unit (CSOR code), required/repeatable, condition.
3. Run the tool with `dryRun: true`, show the lines, and after confirmation repeat with `dryRun: false`. Every write runs `npm run generate_skos` and is rolled back when that fails.
4. Deletes are refused while something still uses the item (e.g. a field used as `conditionPath`); the error lists the rows. `delete_step` only removes `seeAlso` links to the step with `unlink: true`. Deleted concepts are published as withdrawn; ids cannot be renamed.
5. Afterwards run `validate_flows` and show the new `get_flow` outline.
