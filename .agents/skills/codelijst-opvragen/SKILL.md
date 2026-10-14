---
name: codelijst-opvragen
description: 'Answer questions about the RIE-IEPR systeemtypes and eigenschappen of emissiepunten, filters, installaties, meetpunten, uitwisselpunten and onttrekkingspunten, e.g. "Welke typen installaties bestaan er?", "Wat zijn de eigenschappen van een fakkel?", "Welke lozingsplaatsen kan ik kiezen?", "Welke installaties hebben een geïnstalleerd vermogen?".'
---

# Answer questions about types and eigenschappen

Use the read-only tools of the `codelijst-rie-iepr` MCP server; they read `src/source/<systeem>_type.csv` and `src/source/<systeem>_eigenschappen.csv` directly, so the answer reflects the current (possibly unpublished) state of the repository.

| Question | Tool |
|---|---|
| Welke typen <systeem> bestaan er? | `list_types` with the system |
| Wat zijn de eigenschappen van een <type>? | `get_type_properties` with the type as the user wrote it |
| Wat betekent / welke opties heeft eigenschap <x>? Welke types hebben <x>? | `get_property` |
| Waar komt <term> voor? / name not found | `search_codelists` |

## Answering

- Answer in the user's language (usually Dutch) and use the `prefLabel`s, not the ids. Mention ids only when the user works on the CSVs.
- Types: show the hierarchy (subtypes below their `broader` type). Types with `isOnzichtbaar` are structural and not offered to users; mention them separately or leave them out, and say so.
- Eigenschappen of a type: group them as
  - specific to the type (`appliesVia: direct`),
  - inherited from a broader type,
  - common to all types of the system,
  - and, if present, `subtypeProperties` that only apply to some subtypes.
  For each give the kind of value: a number with its unit, text, a date, yes/no, or a choice from a list (name the options when there are few). Mark required (`isVerplicht`) and repeatable (`isMeervoudig`) properties, and show composite properties with their parts.
- If a type has no eigenschappen, say so plainly and offer to add one (skill `codelijst-eigenschap`).
- If a tool reports that a name is ambiguous, ask the user which one they mean (or retry with `system` when the question makes it clear). If nothing matches, try `search_codelists` before saying it does not exist.
- Units are CSOR codes (e.g. `csor_eenheid:E_59` = meter, `csor_eenheid:E_43` = %); only name the unit when you are sure, otherwise give the code.
