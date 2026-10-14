---
name: codelijst-systeemtype
description: 'Add a new systeemtype (type of emissiepunt, filter, installatie, meetpunt, uitwisselpunt or onttrekkingspunt) to the RIE-IEPR code lists in src/source/<systeem>_type.csv. Use when the user asks to add, introduce or register a new type/soort of one of these systems, e.g. "voeg een type fakkel toe", "nieuwe installatie: warmtepomp", "add a subtype of schoorsteen".'
---

# Add a systeemtype

Types live in `src/source/<systeem>_type.csv` (one `skos:ConceptScheme` `conceptscheme:<systeem>_type` per system). Use the `codelijst-rie-iepr` MCP server tools; do not edit the CSV by hand.

## Workflow

1. **Look at what exists.** Call `list_types` for the system. Check that the type does not already exist under another name (compare labels and definitions, also synonyms). If it is close to an existing type, ask the user whether it is a subtype (`broader`) or a separate type.
2. **Collect the fields.** Derive what you can from the request and ask only for what is missing:
   - `code`: lowercase snake_case, Dutch, no prefix: `directe_stookinstallatie`, `schoorsteen_verticale_uitstroom`. Use the noun as the user would say it; drop the system name unless the existing codes in that list include it (`emissiepunt:emissiepunt`, `uitwisselpunt:uitwisselpunt` are the generic types).
   - `prefLabel`: Dutch, starts with a capital, only the first word capitalised unless it is an abbreviation (`GPBV Installatie`): `Schoorsteen met verticale uitstroom`.
   - `definition`: one Dutch sentence ending with a period that says what distinguishes it, e.g. `Een put voor de winning van grondwater.` If the user gives none, propose one and let them confirm it.
   - `broader`: only for a subtype; the subtype is then not a top concept.
   - `isMeetbaar`: defaults to `true` (every systeemtype is meetbaar so far). `isOnzichtbaar`: only for structural types users must not select (like `installatie:gpbv`, `installatie:installatie`); default `false`.
   - `altLabel` / `scopeNote`: only when the user gives a synonym or usage note.
3. **Preview.** Call `add_type` with `dryRun: true` and show the user the CSV line(s) and any warnings.
4. **Write.** After the user confirms, call `add_type` again with `dryRun: false`. The tool then runs `npm run generate_skos`; if that fails, the change is rolled back and the tool returns the generator errors. Fix the cause and retry, or report the errors to the user. Never consider a change done without a passing `generate_skos`.
5. **Check.** Call `validate_codelists` for the system (only new warnings matter; existing ones are known). Tell the user that the regenerated files in `src/main/resources/` are part of the change.
6. **Follow-up.** Ask whether the new type needs its own eigenschappen; if so, continue with the `codelijst-eigenschap` skill (`.agents/skills/codelijst-eigenschap/SKILL.md`). Existing properties that apply to a broader type or to `conceptscheme:<systeem>_type` already cover the new type.

## Notes

- Ids are `<systeem>:<code>`, e.g. `onttrekkingspunt:pompput`. The prefix maps to `https://data.omgeving.vlaanderen.be/id/concept/riepr/<systeem>-type/`, so a code is a published URI and cannot be renamed. To change or delete an existing type, follow `.agents/skills/codelijst-wijzigen/SKILL.md`.
- Several types in a request: preview them together, write them one call each.
- If the MCP tools are unavailable, tell the user the `codelijst-rie-iepr` server is not connected (see the MCP table in `AGENTS.md` for the config file of each agent) rather than editing the CSV by hand. If you have to edit a CSV by hand anyway, run `npm run generate_skos` from the repo root afterwards and only finish when it passes.
