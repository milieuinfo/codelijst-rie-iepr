# AGENTS.md — RIE-IEPR Codelist POC

## 1. What This POC Is

This is a Dutch-language proof-of-concept web app that reads the **RIE-IEPR SKOS/JSON-LD codelist** (`public/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld`) and renders a Vlaanderen-government data-entry form using the `@domg-wc/components` / `@domg-wc/styles` web-component library from the private Artifactory registry.

The POC demonstrates how hierarchical code lists are interpreted: a user picks a thema/sub-thema, then sees operationele velden rendered as `<vl-input-field>`, `<vl-select>`, `<vl-checkbox>`, etc., with composite grouping, multi-value repetition, and a mock structural-instance picker — all without a backend.

**Scope boundaries:** See [`docs/PROJECT_OUTLINE.md`](../docs/PROJECT_OUTLINE.md) for authoritative requirements, guardrails, out-of-scope items, and the full user-flow specification. Key constraints: no persistence, no security hardening, Dutch/Vlaams language only, use `@domg-wc/*` components wherever possible, avoid custom CSS.

## 2. CodelistService — Generic JSON-LD Parsing Strategy

### Flatten-everything into one index

`CodelistService.parseData()` builds a **single `Map<string, JsonLdNode>`** by recursively walking every object/array in the top-level `graph`. Every node that has an `id` (or `@id`) gets indexed; if the same ID appears multiple times (which it does — nodes can be both flattened at the graph root and re-embedded inline elsewhere), later sightings **merge in missing properties rather than replacing**. This handles the source data's mix of compacted aliases (`id`, `_type`, `has_pref_label`) and standard JSON-LD keywords (`@id`, `@type`).

From this canonical index, typed views are derived:
- **schemes** — nodes whose `_type` includes `skos:ConceptScheme`
- **concepts** — nodes whose `_type` includes `skos:Concept`
- **topConcepts** — for each scheme, resolves its `hasTopConcept` / `has_top_concept` references to Concept objects

All relations (broader, narrower, relevantCodeList, relevantRiepr, etc.) are resolved down to **plain id strings** (`string[]` or single string). Consumers always look up the real entity via `result.concepts.get(id)` / `result.schemes.get(id)`. No inline objects flow out of the service.

The approach is deliberately **content-agnostic**: no conceptscheme name or property is special-cased. New schemes or new custom RIE-IEPR properties added to the source data need zero code changes here.

### The `!field.broader` root-field rule (important)

In the source data, `hasTopConcept` redundantly lists **every concept in a scheme**, including composite children. A concept with `broader` set is a child of another concept within the same scheme and should be rendered as part of that parent's composite group, not as a top-level question.

Therefore, in `codelijst-operationeel-fields.ts:50`, root fields are derived as:

```ts
getTopConceptsForScheme(result, schemeId).filter(field => !field.broader)
```

Any future component that needs to distinguish "top-level questions" from "composite children" must apply this same filter.

## 3. vl-* Component Library Integration

### How it works

1. **`.npmrc`** routes all `@domg-wc` and `@domg` scoped packages to the private Artifactory registry (`https://repo.omgeving.vlaanderen.be/artifactory/api/npm/local-npm/`). All other npm packages resolve normally from public registries.

2. **Side-effect imports in `src/main.ts`** — importing `@domg-wc/components/atom`, `/form`, and `/block` is what registers the `<vl-*>` custom elements. There is no separate installation or registration step beyond these three import lines.

3. **Design tokens via CSS imports** — `src/styles/main.css` pulls raw CSS variable sheets from `@domg-wc/styles/base/var/*` and layout grids from `@domg-wc/styles/layout/*/`. The design system's full reset/body modules (`.css.js`) are Lit-tagged-template only and cannot be consumed via plain `@import`; the `<vl-*>` components style themselves inside their shadow DOM, so custom CSS is unnecessary.

4. **No hand-written component styling.** Layout and spacing come entirely from the `@domg-wc/styles` token variables and the vl-* components' own shadow-DOM styles.

### Finding available components and props

There is no locally bundled Storybook. The authoritative API reference lives in:

```
node_modules/@domg-wc/components/<package>/**/*.component.d.ts
```

Look at those TypeScript declaration files to find which `<vl-*>` elements exist, their properties, events, and slot signatures. Use these as your single source of truth when building new UI.

## 4. Mock Data for Structural Lookups

When an operationeel scheme's `relevantRiepr` points at a structural type concept (e.g. `riepr-meetpunt-type:debietmeter`), the app renders a mock dropdown of physical instances. This stands in for what would otherwise be a database lookup against previously reported installations/emission/measuring points.

**File:** `src/services/mock-data.service.ts`

The `SEEDED_INSTANCES` map provides labels keyed by structural-type concept id. Labels are style-matched to the dummy AGC Glass Europe example dataset from the sibling milieuinfo/RIE-IEPR GitHub repo. Any type not explicitly seeded falls back to a generic numbered list (`"<prefLabel> 1"`, `"2"`, `"3"`).

**To add a new structural type**, just add a key+array entry to `SEEDED_INSTANCES`. No other code changes are needed — the fallback already covers unseeded types.

## 5. How to Add Support for a New User-Flow Step

The POC must stay generic so that new flows can be added later per `docs/PROJECT_OUTLINE.md`. The current flow has three steps: thema selection → operationeel fields rendering. To add another step, follow this pattern:

### Step A: Add any new data resolution logic
If the new step needs to resolve references from the codelist (e.g. a new property on Concept or Scheme), extend `CodelistService` with a helper method and/or update the typed models in `src/models/skos-models.ts`. The service is designed to handle new properties without breaking existing ones.

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
- Conditionally render the new component between existing steps based on state
- Handle the new step's events to drive subsequent rendering

### Step D: Update styles if needed
Only if design tokens need updating — import additional `@domg-wc/styles/.../*.raw.css` sheets in `src/styles/main.css`. Prefer existing tokens over adding new ones.

## 6. Task Planning Docs

Task epics live under `docs/tasks/<NN-name>/DESCRIPTION.md`. Each task directory may also contain reviewer feedback or supplementary docs alongside its DESCRIPTION.md. When a task's scope changes during implementation, **update that task's DESCRIPTION.md** to reflect the current state rather than leaving stale AS IS / TO BE sections.

The repository root is `/mnt/d/workspace/omgeving.vlaanderen.be/codelijst-rie-iepr/poc`. All work stays within this directory per the guardrails documented in PROJECT_OUTLINE.md.
