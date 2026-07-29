# Epic 10: Manual UI Review — Accessibility & CSS Issues Found During Testing

**Date:** 2026-07-29  
**Tester:** AI agent via browser automation + manual inspection  
**Scope:** Full user flow across all themes (Lucht, Water, Grondstoffen, Zelfcontrole lucht, Grondwater → sub-thema Kwaliteitsmeting)

---

## AS IS

The POC renders a working form from the RIE-IEPR codelist data. Navigation through theme selection works, composite field groups render correctly, and repeatable fields can be added/removed. However, several accessibility gaps, CSS/layout inconsistencies, and runtime warnings were identified during interactive testing.

## TO BE

All issues below should be resolved so that the POC meets basic WCAG 2.1 AA criteria for forms and provides a polished visual experience consistent with the Vlaanderen design system.

## DOD (Definition of Done)

- Each issue is addressed and verified in the dev server
- No new console errors or Lit update-warnings introduced
- Playwright E2E test passes after changes
- `npm run build` succeeds without warnings

---

## Issues Found

### A1 — Missing skip-navigation link
**Severity:** Medium | **Category:** Accessibility  
**Description:** Users tabbing through the page land on the `<h1>` heading first and must navigate past it to reach form controls. There is no "Skip to content" / "Naar inhoud springen" link at the top of the page.  
**Location:** `index.html`, `src/components/codelijst-app.ts`  
**Fix:** Add a visually-hidden `<a href="#main-content" class="skip-link">Inhoud overslaan</a>` as the first element inside the shadow root, and add an `id="main-content"` attribute to the `<main>` element. Style `.skip-link:focus { position: static; padding: 0.5rem; z-index: 9999; }`.

### A2 — Required fields lack visual indicator
**Severity:** High | **Category:** Accessibility  
**Description:** Fields with `isVerplicht=true` (e.g., `riepr-operationeel-lucht:afvalproduct_aard`) render with the native HTML `required` attribute but display no asterisk (`*`) or "(verplicht)" text next to their label. Screen readers also may not announce them as required if `aria-required="true"` isn't present in the vl-* component's shadow DOM.  
**Location:** `src/services/field-control-factory.ts`, `src/components/codelijst-operationeel-fields.ts`  
**Fix:** 
- In `vl-form-label`, append ` <span aria-hidden="true">*</span>` when `required` is true.
- Ensure vl-* components propagate `aria-required="true"` to their internal focusable elements (check `@domg-wc/components/form` declarations).

### A3 — Duplicate "Operationele gegevens" label
**Severity:** Low | **Category:** CSS / Accessibility  
**Description:** The `<span slot="legend">` inside `<vl-fieldset>` renders "Operationele gegevens", and the accessibility tree also shows a separate plain-text node "Operationele gegevens" before/after the fieldset group, creating redundant announcements for screen reader users.  
**Location:** `src/components/codelijst-app.ts` line 92: `<span slot="legend">Operationele gegevens</span>`  
**Fix:** Either remove the legend span entirely (if the fieldset has no other purpose) or add `aria-hidden="true"` to the duplicated text node outside the fieldset. Review whether the fieldset wrapper adds value at all if it only contains one child component.

### A4 — Lit datepicker update warning in console
**Severity:** Medium | **Category:** JavaScript / Performance  
**Description:** Console shows: `"Element vl-datepicker scheduled an update (generally because a property was set) after an update completed..."`. This is an inefficient rendering pattern that can cause flicker or race conditions.  
**Location:** Likely in `@domg-wc/components/form/datepicker/vl-datepicker.component.js` triggered by our `type="range"` prop or `?required` binding  
**Fix:** 
1. Check if passing both `type` as attribute AND setting internal state causes double-update.
2. If using `vl-datepicker type="range"`, verify there's no conflicting `updated()` lifecycle method inside the component.
3. Report upstream to flux-web-components if it's a library bug; otherwise work around by not re-rendering when only required fields change.

### A5 — Video codec warnings from flux-web-components
**Severity:** Low | **Category:** JavaScript / Noise  
**Description:** Console logs: `"Cannot play media. No decoders for requested formats: video/mp4; codecs=avc1...`. The flux-web-components library attempts to load video assets (likely icons/animations) that aren't available in this environment.  
**Location:** `node_modules/@domg-wc/components/` assets  
**Fix:** Filter these out in console output, or configure Vite dev server to suppress them. Not critical for POC but adds noise during debugging.

### A6 — Empty operationeel scheme shows misleading UI
**Severity:** Medium | **Category:** UX  
**Description:** When selecting "Grondwater → Kwaliteitsmeting", the theme resolves to `conceptscheme:operationeel_grondwater_kwaliteitsmeting` which has zero `hasTopConcept` entries in the source data. The UI renders an empty `<vl-fieldset>` with legend "Operationele gegevens" and no visible fields — confusing for users who expect a form.  
**Location:** `src/components/codelijst-operationeel-fields.ts`, line 63 (`getTopLevelConcepts`)  
**Fix:** 
- Add a fallback message inside the fieldset when `rootFields.length === 0`: `<p class="vl-margin--small">Voor dit thema zijn geen velden gedefinieerd.</p>`.
- Alternatively, log a warning to console noting missing codelist data so developers know which schemes need data fixes upstream.

### A7 — No loading spinner / progress indicator
**Severity:** Low | **Category:** UX  
**Description:** During initial codelist load (1–2 seconds), only static text "Codelijsten laden..." is shown without any visual feedback that progress is being made. On slower connections this could feel like a hang.  
**Location:** `src/components/codelijst-app.ts` line 77  
**Fix:** Replace plain text with `<vl-spinner></vl-spinner><span>Codelijsten laden...</span>` or use a `<vl-progress-bar>` component from the design system.

### A8 — Multiple inputs share non-unique display names across groups
**Severity:** Medium | **Category:** Accessibility  
**Description:** Fields like "Aard", "Naam", and "Verbruik" appear as labels in multiple composite groups (e.g., "Afvalproduct 1" → Aard/Verbruik/Naam AND "Verbruikte brandstof 1" → AS-gehalte/Naam/S-gehalte/Verbruik). Screen reader users navigating by form control name would hear "Aard, textbox" multiple times without context about which group it belongs to.  
**Location:** `src/components/codelijst-operationeel-fields.ts`, all field label rendering  
**Fix:** 
- Include the group prefix in each control's accessible name: e.g., `"Afvalproduct 1 - Aard"` instead of just `"Aard"`.
- This can be done by prepending the parent field's prefLabel + instance number to the `label` prop passed to `vl-form-label` / vl-* controls.

### A9 — No error boundary for codelist load failures
**Severity:** Low | **Category:** UX  
**Description:** The `<vl-alert>` component is used when loading fails, but there are no other error handling paths (e.g., network timeout, malformed JSON-LD, missing properties on concepts). If `CodelistService.loadCodelist()` throws an unexpected error type, it may not display a user-friendly message.  
**Location:** `src/components/codelijst-app.ts` lines 37–45  
**Fix:** Add specific error types and messages for common failure modes:
```ts
catch (error) {
  if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
    this.loadError = 'Kan de codelist niet ophalen. Controleer uw internetverbinding.';
  } else if (error instanceof SyntaxError) {
    this.loadError = 'De codelist bevat ongeldige data. Neem contact op met de beheerder.';
  } else { ... }
}
```

### A10 — Fieldset legend uses span slot instead of heading elements
**Severity:** Low | **Category:** Accessibility  
**Description:** Composite field groups use `<span slot="legend">` inside `<vl-fieldset>`. While vl-fieldset likely renders this as the native HTML5 `<fieldset><legend>`, the text content is plain span text without any heading semantics (`<h2>`–`<h6>`). Screen readers may announce group names less prominently than they should.  
**Location:** `src/components/codelijst-operationeel-fields.ts` line 137  
**Fix:** Check how `vl-fieldset` renders its slot content. If it supports heading-level legends, wrap in appropriate heading tags. Otherwise, ensure the legend text is announced at a sufficient prominence level by the component library.

---

## Summary Table

| ID   | Severity | Category            | Quick Fix Possible? |
|------|----------|---------------------|--------------------|
| A1   | Medium   | Accessibility       | Yes (CSS + HTML)   |
| A2   | High     | Accessibility       | Yes (template)     |
| A3   | Low      | CSS / Accessibility | Yes                |
| A4   | Medium   | JS / Performance    | Maybe (depends on lib) |
| A5   | Low      | JS / Noise          | No (library issue) |
| A6   | Medium   | UX                  | Yes                |
| A7   | Low      | UX                  | Yes                |
| A8   | Medium   | Accessibility       | Yes (template)     |
| A9   | Low      | UX                  | Yes                |
| A10  | Low      | Accessibility       | Maybe              |

**Total: 10 issues found during manual UI review.**
