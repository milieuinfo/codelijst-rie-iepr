# Epic 04: Playwright Validation Suite

## AS IS

- No automated validation existed; the app could silently break with console errors or a blank page and nothing would catch it.
- Manual testing was the only way to verify user flows — easy to miss regressions during refactors or codelist changes.

## TO BE

### Goals

Add a Playwright end-to-end test suite that validates the core codelist-driven form flow and fails the test run if any browser-level `error` message or uncaught exception occurs during execution. This ensures silent failures are always caught.

### In Scope

- Create `tests/codelijst.spec.ts` with 6 tests covering the complete user journey:

  1. **App loads with correct title** — asserts the `<h1>` heading renders on initial load after the codelist is fetched.
  2. **Thema select is visible and has options after codelist loads** — waits for `#thema` (a `vl-select`'s shadow-DOM-internal native `<select>`) to exist and contain more than one option.
  3. **Selecting a thema with children reveals sub-thema, one without does not** — selects `riepr-thema-type:grondwater` and asserts `#sub-thema` appears; then selects `riepr-thema-type:lucht` and asserts `#sub-thema` disappears.
  4. **Selecting a thema without children that maps to operationeel scheme renders fields** — selects "Lucht" and asserts that `<codelijst-operationeel-fields>` renders at least one vl-* control (`vl-input-field`, `vl-select`, `vl-checkbox`, or `vl-datepicker`).
  5. **Selecting a thema with children then sub-thema also renders operationeel fields** — selects "Grondwater" then an index > 0 from `#sub-thema` and asserts operationeel fields render.
  6. **Repeatable field add button works without console errors** — clicks the "+ Nog ... toevoegen" `vl-button` on a multi-valued (`isMeervoudig`) field (e.g. "afvalproduct" in Lucht) and asserts controls are still present after interaction.

- Global browser error interception via `page.on('console')` and `page.on('pageerror')`:
  - Captures every `error`-level log and uncaught exception across each test's full flow.
  - The `afterEach` hook throws if any console errors were recorded, making the entire test run fail.
- Runs against Chromium only (per existing `playwright.config.ts` configuration).

### Out of Scope

- Visual regression testing — no screenshot comparisons or pixel-level assertions.
- Cross-browser matrix — Chromium only per `playwright.config.ts`.
- Accessibility audit — no axe-core or automated WCAG checks.
- Load / performance testing — this is a POC, not production grade.

## DOD (Definition of Done)

- [ ] Test 1 passes: `<h1>` title renders on app load with zero console errors
- [ ] Test 2 passes: `#thema` vl-select has >1 option after codelist loads
- [ ] Test 3 passes: selecting grondwater shows `#sub-thema`; selecting lucht hides it
- [ ] Test 4 passes: selecting lucht without sub-thema renders operationeel vl-* controls
- [ ] Test 5 passes: selecting grondwater → sub-thema index also renders operationeel vl-* controls
- [ ] Test 6 passes: clicking "+ Nog ... toevoegen" on a repeatable field works and controls remain present
- [ ] All 6 tests pass with `npm run test` (`playwright test`) and zero console/page errors are detected across the full flow
