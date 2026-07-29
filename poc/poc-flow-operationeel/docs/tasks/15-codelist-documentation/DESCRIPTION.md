# Task 15: Dutch Documentation — Reading Code Lists & Application Logic

**Status:** ✅ **COMPLETED**
**Priority:** Medium  
**Related Feedback:** #7 — "I am missing clear Dutch documentation that shows how I should read the code lists and what should be application logic (vs logic baked into the code lists)"

## Problem

There is no Dutch-language developer guide explaining:
1. How to interpret SKOS/RDF concepts in the RIE-IEPR codelist JSON-LD
2. Which properties are defined **in the codelist data itself** (declarative) vs which are implemented as **application logic** in TypeScript (imperative)
3. Where to find each concept, property mapping, or rendering rule in the codebase

This makes it difficult for developers and domain experts to understand, extend, or debug the POC without deep diving through source code.

## Deliverable

Create a comprehensive Dutch-language guide at `docs/CODELIST_README_NL.md` (or update existing docs like AGENTS.md or PROJECT_OUTLINE.md with this section). The doc should cover:

### Section 1: Hoe de code lijsten structureren (Codelist Structure)
Explain the key JSON-LD/SKOS concepts used in `rie-iepr.jsonld`:

| Concept | Beschrijving | Voorbeeld URI |
|---------|-------------|---------------|
| `skos:ConceptScheme` | Een verzameling gerelateerde concepten (een "codelijst") | `conceptscheme:thema_type` |
| `skos:Concept` | Een individuele optie binnen een scheme | `riepr-thema-type:lucht` |
| `skos:narrower` / `skos:broader` | Hiërarchische relatie (kind/ouder) | Kind van `grondwater` is `kwaliteitsmeting` |
| `skos:hasTopConcept` | Top-level opties binnen een scheme | Directe kinderen van een operationeel scheme |

### Section 2: RIE-IEPR Specifieke Eigenschappen
Map each RIE-IEPR extension property to its meaning and where it's consumed:

| Eigenschap | Type | Betekenis | Geconsumeerd door |
|-----------|------|-----------|------------------|
| `relevantDataType` | string | Het HTML-formaattype voor dit veld (`xsd:string`, `xsd:boolean`, `xsd:integer`, etc.) | `field-control-factory.ts`, `codelijst-operationeel-fields.ts` |
| `relevantCodeList` | string[] | Referentie naar een ander conceptscheme dat als dropdown-opties moet dienen | `CodelistService.getCodeListSchemes()` |
| `relevantRiepr` | string[] | Referentie naar een structuurtype (meetpunt, procedure, filter...) → wordt een selectievak om een fysiek element te kiezen | `codelijst-operationeel-fields.ts` (structural picker rendering) |
| `relevantUnit` | string[] | Eenheid van meting (QUDT of lokaal gedefinieerde unit concept) | `codelijst-operationeel-fields.ts` (unit addon rendering) |
| `isVerplicht` | boolean | Dit veld is verplicht in te vullen | `codelijst-operationeel-fields.ts` (required attribute + asterisk) |
| `isMeervoudig` | boolean | Gebruiker kan meerdere instanties toevoegen van dit veld | `codelijst-operationeel-fields.ts` (+/− buttons) |
| `conditionPath` / `conditionValue` | string | Voorwaardelijke zichtbaarheid: toon dit veld alleen wanneer het genoteerde veld deze waarde heeft | `_fieldValues` Map + `matchesCondition()` |

### Section 3: Toepassingslogica vs. Codelist-Logica
A clear distinction between what the codelist defines declaratively and what the application implements imperatively:

#### ✅ Logica baked into de code lijsten (declaratief, data-gedreven):
- **Welke thema's bestaan** → `skos:Concept` nodes onder `conceptscheme:thema_type`
- **Hiërarchie van thema's/sub-thema's** → `skos:narrower` / `broader` relaties
- **Welke operationele velden behoren bij een thema** → `relevantRiepr` op thema-concept verwijst naar operationeel scheme
- **Welke velden zijn verplicht** → `isVerplicht` property op concept
- **Welke velden kunnen herhaald worden** → `isMeervoudig` property
- **Voorwaardelijke zichtbaarheid** → `conditionPath` + `conditionValue` properties
- **Dropdown-opties voor een veld** → `relevantCodeList` verwijst naar conceptscheme met opties
- **Eenheden** → `relevantUnit` verwijst naar unit concept of scheme
- **Structuurtypen om uit te kiezen** → `relevantRiepr` op root field of scheme niveau

#### ⚙️ Toepassingslogica in TypeScript (imperatief, code-gedreven):
- **Hoe elk datatype gerenderd wordt** → `field-control-factory.ts`: boolean→checkbox, date→datepicker, numeric→input-field, etc.
- **Composite groepen visueel groeperen** → `vl-fieldset` wrapping + CSS card styling in `codelijst-operationeel-fields.ts`
- **"Add / Remove" buttons voor meervoudige velden** → `addInstance()`/`removeInstance()` methods
- **Structurale picker dropdowns vullen met mock data** → `mock-data.service.ts` (`SEEDED_INSTANCES`)
- **Formulier-labels en verplichte-aanduidingen tonen** → asterisk appended in template rendering
- **Volgorde van weergave** → root fields worden gerenderd in volgorde van `hasTopConcept` array; composite children in volgorde van `narrower` array
- **Error handling bij codelist-laden** → catch blocks in `CodelijstApp.loadCodelist()` met Nederlandse foutmeldingen
- **Ladestatus-indicator** → spinner/plaatsvervanger tijdens `fetch()`

### Section 4: Bestandsstructuur & Waar Te Zoeken
Quick reference for finding relevant code:

```
src/
├── components/
│   ├── codelijst-app.ts              ← Hoofdtoepassing, thema-selectie → operationele velden sturing
│   ├── codelijst-theme-selector.ts    ← Thema/sub-thema selectie UI
│   └── codelijst-operationeel-fields.ts ← Operationele velden rendering (composiet groepen, controls, conditions)
├── services/
│   ├── codelist-service.ts           ← JSON-LD parsing, SKOS traversering, property resolution helpers
│   ├── field-control-factory.ts      ← Data type → HTML control mapping (xsd:boolean→checkbox, etc.)
│   └── mock-data.service.ts          ← Dummy structurele elementen voor structural pickers
├── models/
│   └── skos-models.ts                ← TypeScript interfaces voor Concept en Scheme
└── styles/
    └── main.css                      ← CSS imports van @domg-wc/styles design tokens
```

### Section 5: Voorbeeld — Stap-voor-stap Volgen
Walk through one concrete example from data to rendered form:

**Voorbeeld: "Aard" van een afvalproduct in de Lucht-codelijst**

1. **Gebruiker kiest thema:** `riepr-thema-type:lucht` (Concept onder `thema_type`)
2. **Toepassing volgt relevantRiepr:** lucht concept → `conceptscheme:operationeel_lucht` (Scheme)
3. **Operationeel scheme top-concepten:** `getTopLevelConcepts()` filtert op `!field.broader` → toont "Afvalproduct", "Verbruikte brandstof", etc.
4. **"Afvalproduct" is composiet:** heeft `narrower` kinderen (`..._aard`, `..._hoeveelheid`, `..._naam`)
5. **Elk kind wordt gerenderd als sub-veld binnen `<vl-fieldset>`:**
   - `afvalproduct_aard`: `relevantDataType=xsd:string` → `<vl-input-field type="text">` via `createControl()`
   - `afvalproduct_hoeveelheid`: `relevantDataType=xsd:decimal`, `relevantUnit=[unit:M3]` → `<vl-input-field type="number">` met unit addon "m³"
6. **Voorwaardelijke velden:** Als een kind `conditionPath`/`conditionValue` heeft, wordt het alleen getoond wanneer de trigger-veld waarde matcht

### Section 6: Veelgemaakte Fouten & Tips
- **Condition values zijn URIs:** `conditionValue` in de JSON-LD kan URI-formaat hebben (`concept:true`). De applicatie normaliseert dit naar plain strings voor vergelijking.
- **Broader filter is cruciaal:** Zonder `filter(field => !field.broader)` worden composite children dubbel weergegeven (als root VELD én als onderdeel van hun parent groep).
- **RelevantCodeList vs RelevantRiepr:** `relevantCodeList` = dropdown met codelijst-opties; `relevantRiepr` = dropdown met structurele elementen (installaties, meetpunten) — mock data uit `mock-data.service.ts`.
- **Units kunnen onoplosbaar zijn:** `http://TODO` of externe QUDT URIs die niet in het document voorkomen → val terug op fragment-ID tekst of whitelist lookup.

## DOD
- Dutch-language documentation file exists at `docs/CODELIST_README_NL.md` or equivalent location
- All six section topics above are covered with accurate technical details
- Property mapping table lists every RIE-IEPR extension property with its TypeScript consumer
- Clear distinction between declarative (codelist) and imperative (application) logic
- File structure quick-reference maps source files to their responsibilities
- Concrete example walkthrough traces one complete user flow from JSON-LD to rendered UI
- Document is referenced in AGENTS.md as the primary developer guide for code list interpretation
- `npm run build` succeeds (documentation changes don't affect build)

## Files Changed
| File | Changes |
|------|---------|
| `docs/CODELIST_README_NL.md` | **New** — Comprehensive Dutch guide for reading and understanding the codelist data model and application logic |
| `AGENTS.md` | Add reference to new doc under "Documentation" section |

## Implementation Summary

Created comprehensive Dutch guide at `docs/CODELIST_README_NL.md` covering:
1. SKOS/RDF concepts table (ConceptScheme, Concept, narrower/broader, hasTopConcept)
2. RIE-IEPR extension properties mapping (relevantDataType, relevantCodeList, relevantRiepr, etc.) with TypeScript consumer locations
3. Declarative vs imperative logic distinction — what's in data vs code
4. File structure quick-reference with search guidance
5. Concrete walkthrough example tracing "Afvalproduct → Aard" from JSON-LD to rendered UI
6. Common pitfalls (URI format condition values, broader filter importance, unit resolution gaps, gating behavior)

Updated `AGENTS.md` section 6 to reference this new doc as the primary developer guide for codelist interpretation.
