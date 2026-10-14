---
name: codelijst-wijzigen
description: Edit or delete existing systeemtypes, eigenschappen and the inline selection lists (concept schemes/collections used via relevantCodeList or relevantUnit) of emissiepunten, filters, installaties, meetpunten, uitwisselpunten and onttrekkingspunten. Use when the user asks to change, rename the label of, correct, move, remove or delete a type, eigenschap, list or option, e.g. "pas de definitie van fakkel aan", "verwijder het type gebouw", "maak lozingsplaats meervoudig", "haal riool uit de lozingsplaatsen".
---

# Edit or delete types, eigenschappen and selection lists

Use the `codelijst-rie-iepr` MCP server tools; do not edit the CSVs by hand.

| Change | Tool |
|---|---|
| Label, definition, broader type, flags of a type | `update_type` |
| Anything of an eigenschap: label, definition, applicable types, datatype, unit, code list, flags, composite parent | `update_property` |
| Label/definition of an inline list or of its options | `update_selection_list` |
| Add options/members to an inline list | `add_selection_list` with `extend: true` |
| Remove options/members from an inline list | `remove_list_entries` |
| Delete a type / eigenschap / inline list | `delete_type` / `delete_property` / `delete_selection_list` |

## What deleting and editing means for the published lists

- Identifiers are published URIs. The code of a type, eigenschap or option **cannot be changed**. To "rename" a code, add a new entry and delete the old one, and tell the user that consumers will see a withdrawn concept and a new one (no link between them).
- Changing labels, definitions or other fields keeps the URI; `generate_skos` marks the concept as modified (`dct:modified`, `dct:isVersionOf`).
- Deleting removes the row; after publication the concept is marked `adms:status Withdrawn` against the previous release. Always get explicit confirmation from the user before a delete, after showing what will be removed.

## Workflow

1. **Find the entry.** Use `get_type_properties`, `get_property`, `list_types`, `list_properties` or `search_codelists`. If a name is ambiguous, ask which one is meant.
2. **Edit**: call the update tool with only the fields that change in `set`; `null` clears a field. Examples:
   - turn a free value into a selection: `set: { datatype: null, codeList: [...], codeListSource: ... }` (ask the user whether the list is already published or new; a new list is created first with `add_selection_list`);
   - make it apply to more types: `set: { appliesTo: [...all types...] }` (the list replaces the current one);
   - remove a unit: `set: { unit: null }`; make a type top-level: `set: { broader: null }`.
   Edits of rows that already break a rule (e.g. no definition) are allowed; the old problem is reported as a warning. Propose fixing it too.
3. **Delete**: run the delete tool with `dryRun: true` first and read the result:
   - It is refused while something still refers to the entry; the error lists every referencing row. Rows in the eigenschappen file can be changed with the tools; rows in other code lists (e.g. `operationeel_*.csv`) are out of scope: report them to the user.
   - `delete_type` with `removeFromProperties: true` removes the type from the `relevantRiepr` of eigenschappen that also apply to other types; an eigenschap that would apply to no type must be deleted or re-targeted first.
   - `delete_property` deletes a composite together with its parts, and reports inline lists that become unused; pass `deleteUnusedLists: true` to delete those too.
   - `delete_selection_list` is refused while an eigenschap uses the list; published lists (CSOR, other repos) cannot be deleted from here.
4. **Preview, confirm, write.** Show the user the before/after lines and removed lines from the dry run, then repeat the call with `dryRun: false`. Every write runs `npm run generate_skos`; if it fails the change is rolled back and the errors are returned. Never consider a change done without a passing `generate_skos`.
5. **Check.** Call `validate_codelists` for the system and tell the user that the regenerated files in `src/main/resources/` are part of the change.
