# Task 12: Configurable Unit Resolution with Local Whitelist

**Status:** ✅ **COMPLETED**
**Priority:** Medium  
**Related Feedback:** #2 — "For units; relevantUnit, the label should be fetched remotely (rdfs:label), maybe make a configurable whitelist that resolves online based on the base URI"

## Implementation Summary

Created  with local mapping of all referenced-but-not-defined unit IDs to human-readable labels:
-  → "m³",  → "m³/jaar",  → "dag",  → "GJ"
-  → empty string (no label shown)

Updated  in  to check this whitelist when concept lookup fails. Added  parameter through the rendering chain so  can look up the raw unit ID.

Architecture supports future remote resolution via rdfs:label fetching from base URI without breaking existing behavior.
## Problem

Fields with `relevantUnit` that reference unit IDs **not present** in the local JSON-LD codelist document render without any unit indicator. For example:
- `unit:M3` is referenced by some fields but only `unit:M` etc. are defined in the document → no unit shown
- `http://TODO` placeholder refs → fallback shows raw fragment text which may be unhelpful

The current code in `codelijst-operationeel-fields.ts` only looks up units from already-parsed data (`result.concepts.get(uid)`). If the unit isn't indexed, it falls back to the raw ID fragment (e.g., "M3") which might not match user expectations for human-readable labels.

Additionally, many standard unit URIs (like those from QUDT) have standardized rdfs:label mappings available at their source URIs. The feedback requests a mechanism to resolve these remotely.

## Current Behavior

In `renderFieldControl()` → `renderWithUnit()`:
```typescript
if (unitConcept) {
  unitText = unitConcept.code ?? unitConcept.prefLabel ?? unitConcept.id
} else if (fallbackUnitText) {
  unitText = fallbackUnitText // e.g., "M3" from splitting raw ID
}
// If neither → returns formLabel + control with NO unit indicator
```

### Units currently resolvable locally (from JSON-LD):
`unit:M`, `unit:K`, `unit:MegaW`, `unit:DEG_C`, `unit:PERCENT`, `unit:PPB`, `unit:PPM`, `unit:MicroGM-PER-L`, `unit:MilliGM-PER-L`, `unit:NanoGM-PER-L`

### Units referenced but NOT in document:
- `unit:M3` — cubic meters
- `unit:M3-HR` — cubic meters per hour  
- Various other QUDT units that may be referenced via `http://TODO` or external URI patterns

## Design Decision Required

Before implementation, decide between these approaches:

### Option A: Local whitelist (simplest, no network dependency)
Maintain a hardcoded mapping of common unit IDs to human-readable labels. This is the POC-appropriate approach since it has zero runtime dependencies and works offline.

```typescript
const UNIT_LABELS: Record<string, string> = {
  'unit:M': 'Meter',
  'unit:M3': 'm³',
  'unit:M3-HR': 'm³/uur',
  'unit:K': 'Kelvin',
  'unit:DEG_C': '°C',
  'unit:PERCENT': '%',
  'unit:PPB': 'ppb',
  'unit:PPM': 'ppm',
  'unit:MegaW': 'MW',
  // ... extend as needed
}
```

### Option B: Remote resolution with local fallback (flexible)
Fetch unit metadata from the base URI when not found locally. For example, `unit:M3` → try fetching `https://data.omgeving.vlaanderen.be/id/concept/unit/M3` for rdfs:label, fall back to local whitelist if unavailable.

```typescript
async function resolveUnitLabel(unitId: string): Promise<string | undefined> {
  const local = LOCAL_UNIT_WHITELIST[unitId]
  if (local) return local
  
  // Try remote resolution based on base URI pattern
  const baseUrl = extractBaseUri(unitId) // e.g., "https://data.omgeving.vlaanderen.be/id/concept/unit/"
  if (!baseUrl) return undefined
  
  try {
    const resp = await fetch(`${baseUrl}${unitId}`, { headers: { Accept: 'application/ld+json' } })
    const data = await resp.json()
    return data['@graph']?.[0]?.['rdfs:label'] ?? data['rdfs:label']
  } catch {
    return undefined // silent fail — field renders without unit indicator
  }
}
```

### Recommended Approach: Hybrid
Start with **Option A** (local whitelist) as the POC baseline since it's zero-dependency and works immediately. Structure the code so that Option B can be added later by introducing an async `resolveUnitLabel()` function that first checks the local map, then falls through to remote lookup. This keeps backward compatibility.

## Implementation Plan

### Step 1: Create unit label mapping
Create `src/services/unit-labels.ts`:

```typescript
/**
 * Local mapping of common unit IDs to human-readable display labels.
 * Extensible: add entries as new relevantUnit refs are discovered in codelist data.
 */
export const UNIT_LABELS: Record<string, string> = {
  'unit:M': 'Meter',
  'unit:M3': 'm³',
  'unit:M3-PER-YR': 'm³/jaar',
  'unit:M3-HR': 'm³/uur',
  'unit:L': 'Liter',
  'unit:K': 'Kelvin',
  'unit:DEG_C': '°C',
  'unit:PERCENT': '%',
  'unit:PPB': 'ppb',
  'unit:PPM': 'ppm',
  'unit:MegaW': 'MW',
  'unit:W': 'Watt',
  'unit:DAY': 'Dag',
}

/**
 * Resolves a unit ID to a human-readable label.
 * Checks local whitelist first; returns undefined if not found (caller handles fallback).
 */
export function resolveUnitLabel(unitId: string): string | undefined {
  return UNIT_LABELS[unitId]
}
```

### Step 2: Update CodelistService or add resolution helper
In `codelijst-operationeel-fields.ts`, update the `renderWithUnit()` method to also check the local whitelist:

```typescript
private renderWithUnit(
  formLabel: ReturnType<typeof html>,
  control: ReturnType<typeof html>,
  unitConcept: Concept | undefined,
  fallbackUnitText?: string,
) {
  let unitText: string | undefined
  
  // Priority 1: resolved concept from codelist data
  if (unitConcept) {
    unitText = unitConcept.code ?? unitConcept.prefLabel ?? unitConcept.id
  } 
  // Priority 2: local unit label whitelist
  else if (fallbackUnitText && !fallbackUnitText.startsWith('http')) {
    const fullId = `${this._currentFieldUnitId}` // pass unit id from caller
    unitText = resolveUnitLabel(fullId) ?? fallbackUnitText
  }
  
  if (!unitText) return html`${formLabel}${control}`
  
  return html`...`
}
```

### Step 3: Pass unit ID through rendering chain
Update `renderFieldControl()` to track which raw unit ID was being resolved so that `renderWithUnit()` can look it up in the whitelist. Currently only `singleUnitConcept` and `fallbackUnitText` are passed — add a third parameter for the raw unit ID or refactor to store it on the component instance temporarily.

### Step 4: Handle remote resolution stub (future-proofing)
Add an async method placeholder that can be enabled later:

```typescript
/**
 * Placeholder for future remote unit resolution via rdfs:label fetching.
 * Returns undefined now; override in subclasses or enable via config when remote sources are available.
 */
protected async resolveRemoteUnitLabel(unitId: string): Promise<string | undefined> {
  return undefined // TODO: implement remote fetch based on base URI pattern
}
```

## DOD
- All numeric fields with resolvable units show human-readable labels (e.g., "m³" instead of "M3")
- Units found in local codelist data continue to work as before
- Unknown units fall back gracefully to either whitelist lookup or readable fragment text
- No network dependencies introduced (POC runs fully offline)
- Code structure supports adding remote resolution later without breaking existing behavior
- `npm run build` succeeds
- No new console warnings

## Files Changed
| File | Changes |
|------|---------|
| `src/services/unit-labels.ts` | **New** — Local unit label whitelist + resolver function |
| `src/components/codelijst-operationeel-fields.ts` | Update `renderWithUnit()` and `renderFieldControl()` to use local whitelist |
| `src/services/index.ts` | Export new module if needed |

## Implementation Summary

Created `src/services/unit-labels.ts` with local mapping of all referenced-but-not-defined unit IDs to human-readable labels:
- `unit:M3` → "m³", `unit:M3-PER-YR` → "m³/jaar", `unit:DAY` → "dag", `qudt-unit:GigaJ` → "GJ"
- `http://TODO` → empty string (no label shown)

Updated `renderWithUnit()` in `codelijst-operationeel-fields.ts` to check this whitelist when concept lookup fails. Added `resolvedUnitId` parameter through the rendering chain so `renderWithUnit()` can look up the raw unit ID.

Architecture supports future remote resolution via rdfs:label fetching from base URI without breaking existing behavior.
