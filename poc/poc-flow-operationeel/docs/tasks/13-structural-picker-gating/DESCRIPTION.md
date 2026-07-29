# Task 13: Structural Picker Gating for Children Fields

**Status:** ✅ **COMPLETED**
**Priority:** High  
**Related Feedback:** #3 — "If a relevantRiepr is used on the conceptscheme like is the case with 'Controleinrichting', then the children should not show unless something is selected first since the 'Lozing' applies to the selected controleinrichting."  
**Also covers:** #6 — "relevantRiepr on some items like on riepr-operationeel-lucht:brandstof indicate that you should first select a 'emissie procedure' (link between installation and emissiepunt)."

## Problem

When an operationeel scheme or root field has `relevantRiepr` pointing to a structural/type concept, the current implementation shows all child fields immediately — even though those fields are semantically tied to the selected structural element. The data being collected ("Lozing", brandstof details, etc.) only makes sense **after** a specific structure/procedure has been selected.

### Two patterns observed in the codelist data:

**Pattern A — Scheme-level relevantRiepr gating:**
The theme resolves to an operationeel scheme whose own `relevantRiepr` points to type concepts. Child top-concepts of that scheme should remain hidden until the user selects from the structural picker at the top.

Example: `grondwater-kwaliteitsmeting` → `operationeel_grondwater_kwaliteitsmeting` scheme → has `relevantRiepr` → `filter_type` (Injectiefilter, Omkeerbare filter, Peilfilter, Pompfilter). All child fields of this scheme should be gated behind the filter-type selection.

**Pattern B — Root-field level procedural dependencies:**
Individual root fields have their own `relevantRiepr` pointing to procedure types. Their composite children should only render after selecting from that field's embedded procedural picker.

Example: `brandstof` has `relevantRiepr` → `procedure_type` (emissie, hoofdactiviteit, meting, onttrekking, transport). Children like `brandstof_as`, `brandstof_naam`, `brandstof_s`, `brandstof_verbruik` should only appear after picking a procedure.

## Current Behavior

In `codelijst-operationeel-fields.ts`:

1. **Scheme-level pickers** are rendered via `renderStructuralPicker()` and always visible regardless of whether anything was selected.
2. **Root-field composite groups** with embedded pickers (`renderPickersForRefs()`) show both the picker AND all child fields simultaneously.
3. There is no state tracking for "has user made a structural selection?" — the UI never gates child visibility based on picker values.

## Implementation Plan

### Step 1: Add structural selection state tracking
Add a new Map to track which structural elements have been selected:

```typescript
/** Tracks which structural concept IDs have been selected by the user. */
private structuralSelections = new Map<string, string>() // key = structuralConceptId, value = selectedInstanceId
```

Update `_onControlInput` to also populate this map when a structural picker fires an event:

```typescript
private _onControlInput(event: CustomEvent<VlInputElementEventDetail>) {
  const component = event.currentTarget! as VlSelectElement | VlInputFieldElement | VlDatepickerElement
  const id = component.id
  
  // Track structural selections (structural pickers use bare concept ID as DOM id)
  if (this.result?.concepts.has(id)) {
    const value = event.detail?.value ?? ('value' in component ? (component as any).value : undefined)
    this.structuralSelections.set(id, String(value ?? ''))
  }
  
  // ... existing field value tracking ...
}
```

### Step 2: Gate scheme-level children behind structural selection
In `render()`, after getting root fields and before rendering them, check if the scheme has relevantRiepr children that need gating:

```typescript
// Check if scheme requires structural selection first
const structuralRefs = this._service.getRelevantRieprRefs(this.result, scheme)
const needsGating = structuralRefs.some(ref => 
  Array.isArray((ref as Concept).type) && (ref as Concept).type!.includes('skos:Concept')
)

if (needsGating && !this.anyStructuralSelected()) {
  return html`<p class="vl-margin--small">Selecteer eerst een type hierboven om de bijbehorende velden te bekijken.</p>`
}
```

Add helper method:
```typescript
private anyStructuralSelected(): boolean {
  for (const val of this.structuralSelections.values()) {
    if (val && val !== '') return true
  }
  return false
}
```

### Step 3: Gate root-field children behind embedded procedural picker
In `renderRootFieldContent()`, when a field has an embedded structural picker via `relevantRiepr`:

```typescript
// For fields with embedded procedural pickers, gate children until selection is made
if (children.length > 0 && groupPicker !== nothing) {
  const pickerId = this.findEmbeddedPickerId(field) // determine which structural concept ID corresponds to this field's picker
  
  if (!pickerId || !this.structuralSelections.get(pickerId)) {
    return nothing // Hide the entire composite group until procedure is selected
  }
}
```

The challenge here is mapping which embedded picker belongs to which field. Since `groupPicker` is rendered inside the vl-fieldset alongside children, we need to identify the structural concept that owns each picker. This can be done by tracking the concept IDs used in `renderPickersForRefs()` calls within the context of a specific root field.

Alternative simpler approach: Instead of per-field gating, use a single flag — **any** structural element must be selected before **any** children are shown globally. This matches the feedback #3 intent and is simpler to implement:

```typescript
// In render(): after rendering structural pickers but before child groups
const allStructuralConceptIds = new Set<string>()
for (const ref of structuralRefs) {
  if ((ref as Concept).type?.includes('skos:Concept')) {
    allStructuralConceptIds.add(ref.id)
  }
}
// Also check root fields' relevantRiepr for embedded procedural types
for (const field of rootFields) {
  for (const rieprId of field.relevantRiepr ?? []) {
    const rieprConcept = this.result!.concepts.get(rieprId)
    if (rieprConcept?.type?.includes('skos:Concept')) {
      allStructuralConceptIds.add(rieprId)
    }
  }
}

if (allStructuralConceptIds.size > 0 && !this.anyStructuralSelected()) {
  // Show "select a structure first" message instead of child groups
}
```

### Step 4: Provide helpful messaging
When children are gated, show a clear Dutch message explaining what to do:

```typescript
const gatingMessage = html`<p class="vl-margin--small">
  Selecteer eerst een type in de bovenstaande lijst om de bijbehorende operationele velden te bekijken.
</p>`
```

If multiple structural pickers exist, list them with their labels so the user knows which ones need selection.

## DOD
- When an operationeel scheme has scheme-level `relevantRiepr`, child fields remain hidden until the user selects from the structural picker
- A clear Dutch message explains why no fields are shown ("Selecteer eerst een type...")
- Once a structural element is selected, child fields render normally
- Root fields with embedded procedural pickers (e.g., brandstof → procedure_type) also gate their children behind the procedural selection
- No regression on existing flows that don't use relevantRiepr for gating
- `npm run build` succeeds
- No new console warnings

## Files Changed
| File | Changes |
|------|---------|
| `src/components/codelijst-operationeel-fields.ts` | Add `structuralSelections` Map; update `_onControlInput` to track selections; add gating logic in `render()` and `renderRootFieldContent()` |

## Implementation Summary

Added three new methods and one state Map:
- `structuralSelections` Map — tracks which structural/procedural concept IDs have been selected
- `anyStructuralSelected()` — checks if any selection has been made
- `collectAllStructuralConceptIds()` — gathers all structural concept IDs from scheme-level and field-level relevantRiepr refs
- `getEmbeddedPickerIds(field)` — collects embedded procedural picker IDs even when field has direct children (fixes afvalproduct/brandstof issue)
- `getGateInstructionMessage(scheme, rootFields)` — derives gating message from data (relatedRiepr definition/prefLabel or selecteerEerstMessage) instead of hardcoding
- `getFieldGateMessage(field)` — per-field version for embedded pickers

Root fields are sorted via `sortRootFieldsByConditionDependencies()` so conditional fields render AFTER their triggers. Composite child groups with embedded procedural pickers gate behind selection using dynamic messages derived from source data definitions rather than hardcoded strings.
