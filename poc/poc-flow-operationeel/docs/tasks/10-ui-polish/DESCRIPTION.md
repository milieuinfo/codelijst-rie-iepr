# Task: UI Polish — Minor fixes and cleanup

**Parent:** Epic 10 — Manual UI Review  
**Priority:** Low  
**Related Issues:** A3, A5, A9, A10  

## A3 — Remove duplicate "Operationele gegevens" label
The fieldset legend `<span slot="legend">Operationele gegevens</span>` plus any surrounding text creates redundant announcements in the accessibility tree. Either remove the span slot content if it's duplicated elsewhere, or add `aria-hidden="true"` to the non-fieldset copy.

**Location:** `src/components/codelijst-app.ts` line 92

## A5 — Suppress video codec warnings from flux-web-components
Console noise from `@domg-wc/components` trying to load unavailable video assets. Filter these out via Vite dev config or suppress at the browser level. Not a code fix — accept as library limitation for POC scope.

## A9 — Add error boundary handling for codelist load failures
In `src/components/codelijst-app.ts`, enhance the catch block (lines 40–43) with user-friendly Dutch messages for common failure modes:
- Network timeout → "Kan de codelist niet ophalen. Controleer uw internetverbinding."
- Malformed JSON-LD → "De codelist bevat ongeldige data. Neem contact op met de beheerder."
- Generic error → current behavior (show error message)

## A10 — Verify vl-fieldset renders proper HTML5 semantics
Check that `<vl-fieldset>` renders a native `<fieldset><legend>` element pair inside its shadow DOM so screen readers announce group names correctly. If the component uses a div-based structure instead, file an upstream ticket with flux-web-components but add no workaround in the POC.

**Location:** `node_modules/@domg-wc/components/field-set/` 

### DOD
- No duplicate label text in accessibility tree
- Console free of non-critical warnings during normal use
- Error messages are clear and actionable in Dutch
- Build succeeds (`npm run build`)
