# AGENTS.md — RIE-IEPR Codelist POC

## 1. What This POC Is

This is a Dutch-language proof-of-concept web app that reads the **RIE-IEPR SKOS codelist** as RDF (`public/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.ttl`) and renders a Vlaanderen-government data-entry form using the `@domg-wc/components` / `@domg-wc/styles` web-component library from the private Artifactory registry.

The POC demonstrates how hierarchical code lists are interpreted: a user picks a thema/sub-thema, then sees operationele velden rendered as `<vl-input-field>`, `<vl-select>`, `<vl-checkbox>`, etc., with composite grouping, multi-value repetition, structural pickers, and multi-step flow chaining via `vervolgstap` (`qb:codeList`) — all without a backend.

**Scope boundaries:** See [`docs/PROJECT_OUTLINE.md`](../docs/PROJECT_OUTLINE.md) for authoritative requirements, guardrails, out-of-scope items, and the full user-flow specification. Key constraints: no persistence, no security hardening, Dutch/Vlaams language only, use `@domg-wc/*` components wherever possible, avoid custom CSS.

## 2. CodelistService — RDF Parsing by IRI

### The contract is the IRIs, not the names

`parseCodelist()` (`src/services/codelist-parse.ts`) parses `rie-iepr.ttl` with N3.js. Every property and type is matched on its **full IRI**, listed in `src/services/vocab.ts`. CSV column names and JSON-LD term names are never used, so they can be renamed upstream without breaking the POC; only a changed IRI is a breaking change. When the POC needs a new property, add its IRI to `vocab.ts`.

IRIs are compacted to CURIE ids (`lucht:brandstof`, `conceptscheme:thema_type`, `skos:Concept`, `xsd:decimal`) because the rest of the POC, the DOM ids and the tests use those. The prefixes in `PREFIXES` (`vocab.ts`) cover every namespace the code refers to by CURIE and take precedence over the document's `@prefix` declarations, which are used only for all other namespaces. `result.prefixes` holds the combined map.

From one index of subjects (`nodesById`: id → predicate IRI → terms), typed views are derived:
- **schemes** — subjects typed `skos:ConceptScheme`
- **concepts** — subjects typed `skos:Concept`
- **topConcepts** — for each scheme, its `skos:hasTopConcept` values resolved to Concept objects. RDF values are unordered (the Turtle lists them alphabetically); the display order comes from `uiFirst`/`uiAfter` (`ui-sort.ts`).

All relations (broader, narrower, relevantCodeList, relevantRiepr, vervolgstap, etc.) are resolved down to **plain id strings** (`string[]` or single string). Consumers always look up the real entity via `result.concepts.get(id)` / `result.schemes.get(id)`.

The approach is deliberately **content-agnostic**: no conceptscheme name or property is special-cased. New schemes or new custom RIE-IEPR properties added to the source data need zero code changes here.

### The `!field.broader` root-field rule (important)

In the source data, `hasTopConcept` redundantly lists **every concept in a scheme**, including composite children. A concept with `broader` set is a child of another concept within the same scheme and should be rendered as part of that parent's composite group, not as a top-level question.

Therefore, in `codelijst-operationeel-fields.ts`, root fields are derived as:

```ts
getTopLevelConceptsForScheme(result, schemeId).filter(field => !field.broader)
```

Any future component that needs to distinguish "top-level questions" from "composite children" must apply this same filter.

### vervolgstap-based navigation model

`vervolgstap` (the column in the source CSVs, published as `qb:codeList`) links a concept to the next step (a conceptscheme). It is used for two purposes:

1. **Theme → operationeel scheme navigation:** Each thema concept has a `vervolgstap` pointing at its corresponding operationeel conceptscheme. Use `CodelistService.resolveOperationeelSchemeId()` which tries `vervolgstap` first, then falls back to `relevantRiepr` for backward compatibility.

2. **Multi-step flow chaining:** Within operational schemes, structural/feature concepts can have a `vervolgstap` pointing to sub-schemes. When the user selects a value for such a concept, the app navigates to the target scheme via a `flow-navigate` custom event. Example: `lucht:feature_bron` has `vervolgstap` `conceptscheme:operationeel_lucht_rapportering`. After selecting bronnen, the app transitions to render the detailed reporting fields from that sub-scheme.

Service methods:
- `getVervolgstapRefs(result, node)` — resolves `vervolgstap` refs to Scheme or Concept objects (external URIs silently dropped)
- `resolveOperationeelSchemeId(result, themeConcept)` — primary method for theme→scheme resolution

## 3. vl-* Component Library Integration

### How it works

1. **`.npmrc`** routes all `@domg-wc` and `@domg` scoped packages to the private Artifactory registry (`https://repo.omgeving.vlaanderen.be/artifactory/api/npm/local-npm/`). All other npm packages resolve normally from public registries.

2. **Side-effect imports in `src/main.ts`** — importing `@domg-wc/components/atom`, `/form`, and `/block` is what registers the `<vl-*>` custom elements. There is no separate installation or registration step beyond these three import lines.

3. **Design tokens via CSS imports** — `src/styles/main.css` pulls raw CSS variable sheets from `@domg-wc/styles/base/var/*` and layout grids from `@domg-wc/styles/layout/*/`. The design system's full reset/body modules (`.css.js`) are Lit-tagged-template only and cannot be consumed via plain `@import`; the `<vl-*>` components style themselves inside their shadow DOM, so custom CSS is unnecessary.

4. **No hand-written component styling.** Layout and spacing come entirely from the `@domg-wc/styles` token variables and the vl-* components' own shadow-DOM styles.

5. **`vl-fieldset` shrinks inherited text.** In `@domg-wc/components` 2.16, `vl-fieldset` adopts the form-label styles, whose `:host` rule sets `font-size: 62.5%`. Everything that inherits — for example the options of a `vl-select-rich` — becomes 11.25px, and nested fieldsets 7px. Every component that renders a `vl-fieldset` therefore adds `vl-fieldset { font-size: inherit }` to its `static styles` (`codelijst-app` and `codelijst-operationeel-fields`). Document CSS cannot fix this, because the fieldset lives inside the component's shadow root.

### Finding available components and props

There is no locally bundled Storybook. The authoritative API reference lives in:

```
node_modules/@domg-wc/components/<package>/**/*.component.d.ts
```

Look at those TypeScript declaration files to find which `<vl-*>` elements exist, their properties, events, and slot signatures. Use these as your single source of truth when building new UI.

## 4. Mock Data for Structural Lookups

When an operationeel scheme's `relevantRiepr` points at a structural type concept (e.g. `meetpunt:debietmeter`), the app renders a mock dropdown of physical instances. This stands in for what would otherwise be a database lookup against previously reported installations/emission/measuring points.

**File:** `src/services/mock-data.service.ts`

The `SEEDED_INSTANCES` map provides labels keyed by structural-type concept id. Labels are style-matched to the dummy AGC Glass Europe example dataset from the sibling milieuinfo/RIE-IEPR GitHub repo. Any type not explicitly seeded falls back to a generic numbered list (`"<prefLabel> 1"`, `"2"`, `"3"`).

**To add a new structural type**, just add a key+array entry to `SEEDED_INSTANCES`. No other code changes are needed — the fallback already covers unseeded types.

## 5. Multi-Step Flow Architecture

### Flow stack model

`codelijst-app.ts` maintains a `flowStack: FlowStep[]` where each step is `{ schemeId, triggerConceptId? }`. The base step has no trigger (it comes from theme selection). Subsequent steps are pushed when a structural field with a `vervolgstap` gets a value.

### Navigation events

- **Theme selection** → resets flow stack, resolves base operationeel scheme via `resolveOperationeelSchemeId()`
- **Structural field value change** → checks if the concept has a `vervolgstap` pointing to a scheme → emits `flow-navigate` event with `{ schemeId, triggerConceptId }`
- **Back navigation** → pops from flow stack, shows breadcrumb nav when depth > 1

### Rendering

The current scheme being rendered is always `flowStack[flowStack.length - 1].schemeId`. The `<codelijst-operationeel-fields>` component renders fields for that scheme and listens for its own `flow-navigate` events to chain deeper.

## 6. How to Add Support for a New User-Flow Step

The POC must stay generic so that new flows can be added later per `docs/PROJECT_OUTLINE.md`. To add another step or handle new codelist properties:

### Step A: Add any new data resolution logic
If the new step needs to resolve references from the codelist (e.g. a new property on Concept or Scheme), extend `CodelistService` with a helper method and/or update the typed models in `src/models/` (`concept.interface.ts`, `scheme.interface.ts`). The service is designed to handle new properties without breaking existing ones.

### Step B: Create a new Lit component
Create `src/components/codelijst-new-step.ts`:
- Accept `.result` (CodelistResult) and any relevant input via Lit reactive properties (`static override properties = { ... }`)
- Render using `<vl-*>` components only; no custom CSS beyond `:host { display: block }`
- Emit events (`CustomEvent` with `bubbles: true, composed: true`) for user interactions
- Register with `customElements.define()` at module bottom

### Step C: Wire it into the app
In `src/components/codelijst-app.ts`:
- Import the new component
- Add state variables for tracking the new step's selections
- Conditionally render the new component between existing steps based on flow stack state
- Handle the new step's events to drive subsequent rendering

### Step D: Update styles if needed
Only if design tokens need updating — import additional `@domg-wc/styles/.../*.raw.css` sheets in `src/styles/main.css`. Prefer existing tokens over adding new ones.

## 7. Codelist Sync Mechanism

The POC reads `rie-iepr.ttl` from its own copy at `public/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.ttl`, served by Vite as a static asset. This file is **not** the canonical source — the authoritative version lives in the parent project at `../../src/main/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.ttl`.

A no-dependency Node script (`scripts/sync-codelist.mjs`) copies the upstream file into place before every dev server start and build.

### CSOR lists (`scripts/sync-csor.mjs`)

CSOR concepts (eenheden, variabelen, kwantificeerbare aspecten, dragers, soorten waardebepaling) are published in separate GitHub repositories and are not part of `rie-iepr.ttl`. `scripts/sync-csor.mjs` scans every CSV in `src/source` for `csor_*` CURIEs (including collection members and the CSOR semantics columns) and downloads only the lists that are needed:

| Prefix | GitHub repository |
|---|---|
| `csor_eenheid` | `milieuinfo/codelijst-csor-eenheid` |
| `csor_variabele` | `milieuinfo/codelijst-csor-variabele` |
| `csor_kwantificeerbaaraspect` | `milieuinfo/codelijst-csor-kwantificeerbaar-aspect` |
| `csor_drager` | `milieuinfo/codelijst-csor-drager` |
| `csor_soortwaardebepaling` | `milieuinfo/codelijst-csor-soort-waardebepaling` |

The result is `src/generated/csor.json` (label, definition, unit symbol, notation). The script always downloads from GitHub (`raw.githubusercontent.com`, branch `main`); a local checkout is never used. The download is cached in `.cache/csor/` and only serves as a fallback when GitHub is unreachable (`--offline` uses the cache without trying the network). Without network and cache it fails loudly, except with `--allow-stale`, which keeps the committed `csor.json`.

- **`npm run predev`** → `sync-codelist.mjs` → `sync-csor.mjs --allow-stale` → then `vite` starts with fresh data.
- **`npm run prebuild`** → same syncs → then `tsc && vite build` compiles against it.
- **`npm run sync:csor`** → refresh `csor.json` manually (fails loudly when GitHub and the cache are both unavailable).

If the codelist source file is missing, `sync-codelist.mjs` logs a warning and exits 0 (the existing destination copy is left untouched). `sync-csor.mjs` needs `n3` (devDependency) to parse Turtle; the sync-codelist script uses only Node.js built-ins.

This ensures the POC always runs against the latest codelist and CSOR labels without a human remembering to copy files manually.

## 8. Developer Guide — Reading Codelists (Dutch)

For a comprehensive Dutch-language explanation of how to read and interpret the RIE-IEPR codelist data model, which properties are declarative (in the codelist) vs imperative (TypeScript application logic), and where to find each concept mapping in the source code, see the root repository's [`README.md`](../../../README.md), section **"Interpretatie"**. This is the authoritative specification for how the codelist should be interpreted by the application.

## 9. Task Planning Docs

Task epics live under `docs/tasks/<NN-name>/DESCRIPTION.md`. Each task directory may also contain reviewer feedback or supplementary docs alongside its DESCRIPTION.md. When a task's scope changes during implementation, **update that task's DESCRIPTION.md** to reflect the current state rather than leaving stale AS IS / TO BE sections.

The project outline with current tasks is at [`docs/PROJECT_OUTLINE.md`](../docs/PROJECT_OUTLINE.md).

The repository root is `/mnt/d/workspace/omgeving.vlaanderen.be/codelijst-rie-iepr/poc`. All work stays within this directory per the guardrails documented in PROJECT_OUTLINE.md.
