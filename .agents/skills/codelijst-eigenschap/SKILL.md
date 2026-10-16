---
name: codelijst-eigenschap
description: 'Add a new eigenschap (property) for emissiepunten, filters, installaties, meetpunten, uitwisselpunten or onttrekkingspunten to src/source/<systeem>_eigenschappen.csv, including composite properties, units and selection lists (relevantCodeList). Use when the user asks to add a property, field, attribuut or eigenschap to one of these system types, e.g. "voeg de hoogte toe aan een fakkel", "een installatie moet een brandstoftype kunnen kiezen".'
---

# Add an eigenschap

Properties live in `src/source/<systeem>_eigenschappen.csv` (`conceptscheme:<systeem>_eigenschappen`). Each property says which types it applies to (`relevantRiepr`), what kind of value it holds (`relevantDataType` or `relevantCodeList`), and how (`relation`). Use the `codelijst-rie-iepr` MCP server tools; do not edit the CSV by hand.

## Workflow

1. **Look at what exists.** Call `list_properties` for the system. It lists the current properties (good examples to copy), the inline selection lists and the available types. Make sure the property does not already exist; if an existing one applies to other types, ask whether to extend that one instead (`update_property` with a new `appliesTo`, see the `codelijst-wijzigen` skill).
2. **Decide the shape** of the property:
   - **Simple value**: one input field → `datatype`.
   - **Selection**: choose from a list → `codeList` (see step 3).
   - **Composite**: several fields that belong together and are filled in together, often repeatable (e.g. `referentiepunt` = naam + diepte, `verwijderingsrendement` = stof + percentage). Create the parent with `composite: true` (and usually `isMeervoudig: true`), then each part with `parent: <parent code>` and code `<parent>_<part>`. The parts point to the composite with `broaderPartitive`; that is what makes them its composite attributes (e.g. `meetpunt-eigenschappen:referentiepunt_naam` and `_diepte` → `meetpunt-eigenschappen:referentiepunt`). The composite itself has no datatype, code list or unit.
3. **For a selection, ask the user where the list comes from** (never guess):
   - **Already published** (CSOR, another RIE-IEPR list such as `conceptscheme:status_type`, an external URI): find it with `find_code_lists` (`searchPublished: true` also searches data.omgeving.vlaanderen.be) and pass it with `codeListSource: 'published'`.
   - **New list of options** that only exist for this property (like `lozingsplaats`: oppervlaktewater, riool, grondwater): create a concept scheme in the same CSV with `add_selection_list` `kind: 'conceptscheme'` and pass it with `codeListSource: 'inline'`.
   - **Subset of a published list** (like the CSOR stoffen for `verwijderingsrendement_stof`): create a collection with `add_selection_list` `kind: 'collection'` whose members are the existing concept URIs/CURIEs, and pass it with `codeListSource: 'inline'`.
   Ask also whether several values may be selected (`isMultiselect`).
4. **Collect the fields.** Derive what you can and ask only for what is missing:
   - `code`: lowercase snake_case Dutch, no prefix: `nominaal_thermisch_vermogen`. Parts: `<parent>_<part>`.
   - `prefLabel`: Dutch, capital first letter: `Geinstalleerd vermogen`. For parts the short field name is enough (`Naam`, `Diepte`).
   - `definition`: one Dutch sentence ending with a period; propose one if the user gives none. Composite parents: `Samengestelde eigenschap voor <x> (<part> en <part>).`
   - `appliesTo` (`relevantRiepr`): the types from `<systeem>_type.csv` this property is relevant for. Subtypes inherit from a broader type, so pick the most general type that fits; `["all"]` means every type of the system (`conceptscheme:<systeem>_type`). Required on top-level properties. A composite carries it either on the parent (parts inherit it, e.g. `waterzuiveringstechniek`) or on each of its parts (e.g. `referentiepunt`: `_naam` and `_diepte` apply to `meetpunt:peilput`); the tools accept both and combine them when answering which properties a type has.
   - `datatype` (`relevantDataType`): every eigenschap that is not a composite has an xsd datatype, unless it has a `relevantCodeList` (a selection from another list); free text is `xsd:string`, never empty. Options: `xsd:string` (free text), `xsd:decimal` (measurements, capacities, percentages), `xsd:integer` (counts, e.g. aantal uitstroompunten), `xsd:boolean` (ja/nee), `xsd:date`, `xsd:dateTime`, `xsd:duration`.
   - `unit` (`relevantUnit`): only for numbers. A CSOR unit such as `csor_eenheid:E_59` (meter) or `csor_eenheid:E_43` (%), or a collection of units when the user may choose (create it with `add_selection_list` `kind: 'collection'`, like `collectie:vermogen_eenheden`). If you do not know the CSOR code, ask the user rather than guessing.
   - `relation`: defaults to `rdfs:value`. In composite parts use `rdfs:label` for a name, `riepr:parameter` for the substance/parameter a value is about, `riepr:inGebruikVan` for a start date.
   - `relevantProperty`: optional external property it corresponds to: `dbo:height`, `dbo:depth`, `dbo:diameter`.
   - `isVerplicht` (required), `isMeervoudig` (may be added several times).
5. **Preview.** Call the tools with `dryRun: true` (selection list first, then the property, then parts) and show the user all CSV lines together.
6. **Write.** After the user confirms, repeat the calls with `dryRun: false` in the same order. `add_property` refuses an inline code list that does not exist yet, so the list must be written first. Every write runs `npm run generate_skos`; if that fails, that write is rolled back (earlier writes in the sequence stay) and the tool returns the generator errors. Fix the cause and retry, or report the errors to the user. Never consider a change done without a passing `generate_skos`.
7. **Check.** Call `validate_codelists` for the system (only new warnings matter; existing ones are known). Tell the user that the regenerated files in `src/main/resources/` are part of the change.

## Examples from the code lists

| Property | Shape |
|---|---|
| `emissiepunt-eigenschappen:hoogte` | `xsd:decimal`, unit `csor_eenheid:E_59`, relevantProperty `dbo:height`, applies to `emissiepunt:emissiepunt_lucht` |
| `emissiepunt-eigenschappen:lozingspunt-lozingsplaats` | codeList `conceptscheme:lozingspunt_lozingsplaats`, an inline concept scheme in the same CSV |
| `installatie-eigenschappen:nominaal_thermisch_vermogen` | `xsd:decimal`, unit chosen from inline collection `collectie:vermogen_eenheden` |
| `installatie-eigenschappen:verwijderingsrendement` | composite, isMeervoudig; parts `_stof` (relation `riepr:parameter`, codeList = inline collection of CSOR stoffen) and `_percentage` (`xsd:decimal`, `%`) |
| `meetpunt-eigenschappen:referentiepunt` | composite; parts `_naam` (`rdfs:label`, `xsd:string`) and `_diepte` (`xsd:decimal`, meter) |

## Notes

- New inline concept schemes get the id `conceptscheme:<systeem>_<name>`, their options `<systeem>-selectiemogelijkheden:<code>`. The tool declares that prefix in `config.yml` and the README prefix table the first time. Options share that prefix across all lists of a system, so choose specific codes.
- Adding a list or `isMultiselect` to a file that lacks the `collections`/`isMultiselect` column appends that column, which touches every line of the CSV. Mention this when showing the preview.
- Ids become published URIs and cannot be renamed. To change or delete existing eigenschappen, lists or options, follow `.agents/skills/codelijst-wijzigen/SKILL.md`.
- If the MCP tools are unavailable, tell the user the `codelijst-rie-iepr` server is not connected (see the MCP table in `AGENTS.md` for the config file of each agent) rather than editing the CSV by hand. If you have to edit a CSV by hand anyway, run `npm run generate_skos` from the repo root afterwards and only finish when it passes.
