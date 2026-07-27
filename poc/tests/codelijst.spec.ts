import { test, expect } from '@playwright/test'

interface ConsoleError {
  type: string
  text: string
}

test.describe('Codelijst App', () => {
  let consoleErrors: ConsoleError[] = []

  test.beforeEach(async ({ page }) => {
    consoleErrors = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push({ type: msg.type(), text: msg.text() })
      }
    })
    page.on('pageerror', err => {
      consoleErrors.push({ type: 'pageerror', text: err.message })
    })
    await page.goto('/')
  })

  test.afterEach(async () => {
    if (consoleErrors.length > 0) {
      const summaries = consoleErrors.slice(0, 10).map(e => `[${e.type}] ${e.text}`)
      throw new Error(`Console errors detected (${consoleErrors.length} total):\n` + summaries.join('\n'))
    }
  })

  test('app loads with correct title', async ({ page }) => {
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.locator('h1')).toHaveText('RIE-IEPR Codelijst POC')
  })

  test('thema select is visible and has options after codelist loads', async ({ page }) => {
    // Wait for the codelist to load — the theme selector becomes enabled
    // once the data arrives. The vl-select host and its shadow-DOM-internal
    // native <select> both carry id="thema", so the tag qualifier is required
    // to disambiguate (a bare `#thema` locator hits both and is a strict-mode
    // violation).
    await expect(page.locator('select#thema')).toBeVisible()
    // <option> elements report as non-"visible" to Playwright while their <select> is
    // closed (empty bounding box), so wait for DOM presence rather than visibility.
    await expect(page.locator('select#thema option:not([value=""])').first()).toBeAttached()
    const optionCount = await page.locator('select#thema option').count()
    expect(optionCount).toBeGreaterThan(1)
  })

  test('selecting a thema with children reveals sub-thema, one without does not', async ({ page }) => {
    // --- Grondwater HAS children (Kwaliteitsmeting, Onttrekking/infiltratie, Peilmetingen) ---
    await expect(page.locator('select#thema')).toBeVisible()
    await page.selectOption('select#thema', { value: 'riepr-thema-type:grondwater' })

    // Sub-thema dropdown should appear
    await expect(page.locator('select#sub-thema')).toBeVisible()
    const subOptions = await page.locator('select#sub-thema option').count()
    expect(subOptions).toBeGreaterThan(1)

    // Now switch to a thema WITHOUT children — sub-thema should disappear
    await page.selectOption('select#thema', { value: 'riepr-thema-type:lucht' })
    await expect(page.locator('select#sub-thema')).not.toBeVisible()
  })

  test('selecting a thema without children that maps to operationeel scheme renders fields', async ({ page }) => {
    // Lucht has no sub-themas but its relevantRiepr -> conceptscheme:operationeel_lucht
    await expect(page.locator('select#thema')).toBeVisible()
    await page.selectOption('select#thema', { value: 'riepr-thema-type:lucht' })

    // Wait for the operationeel-fields component to appear and render vl-* controls
    const opFields = page.locator('codelijst-operationeel-fields')
    await expect(opFields).toBeVisible()

    // Count vl-* child elements inside operationeel-fields (the structural picker + root fields)
    const inputFields = opFields.locator('vl-input-field').count()
    const selects = opFields.locator('vl-select').count()
    const checkboxes = opFields.locator('vl-checkbox').count()
    const datepickers = opFields.locator('vl-datepicker').count()

    const totalControls = (await inputFields) + (await selects) + (await checkboxes) + (await datepickers)
    expect(totalControls).toBeGreaterThan(0)
  })

  test('selecting a thema with children then sub-thema also renders operationeel fields', async ({ page }) => {
    // Grondwater -> Onttrekking/infiltratie has relevantRiepr -> operationeel_grondwater_onttrekking
    await page.selectOption('select#thema', { value: 'riepr-thema-type:grondwater' })
    await expect(page.locator('select#sub-thema')).toBeVisible()

    await page.selectOption('select#sub-thema', { value: 'riepr-thema-type:grondwater-onttrekking' })

    const opFields = page.locator('codelijst-operationeel-fields')
    await expect(opFields).toBeVisible()

    const inputFields = opFields.locator('vl-input-field').count()
    const selects = opFields.locator('vl-select').count()
    const totalControls = (await inputFields) + (await selects)
    expect(totalControls).toBeGreaterThan(0)
  })

  test('repeatable field add button works without console errors', async ({ page }) => {
    // Afvalproduct in lucht scheme has isMeervoudig=true and renders a "+ Nog afvalproduct toevoegen" button
    await page.selectOption('select#thema', { value: 'riepr-thema-type:lucht' })

    const opFields = page.locator('codelijst-operationeel-fields')
    await expect(opFields).toBeVisible()

    // Look for the add button inside operationeel fields
    const addButton = opFields.locator('vl-button', { hasText: /Nog.*toevoegen/ }).first()
    if (await addButton.isVisible()) {
      await addButton.click()
      // After clicking, verify that at least one vl-* control still exists (component didn't break)
      const controlsAfter = opFields.locator('vl-input-field, vl-select, vl-checkbox, vl-datepicker').count()
      expect(await controlsAfter).toBeGreaterThan(0)
    }
  })

  // --- Regression tests for fixed bugs ---

  test('subtypes must not leak into top-level thema selector', async ({ page }) => {
    await expect(page.locator('select#thema')).toBeVisible()
    await expect(page.locator('select#thema option:not([value=""])').first()).toBeAttached()

    const grondwaterKwaliteitsmetingInThema = await page.locator(
      'select#thema option[value="riepr-thema-type:grondwater-kwaliteitsmeting"]',
    ).count()
    expect(grondwaterKwaliteitsmetingInThema).toBe(0)

    await page.selectOption('select#thema', { value: 'riepr-thema-type:grondwater' })

    const grondwaterKwaliteitsmetingInSubThema = await page.locator(
      'select#sub-thema option[value="riepr-thema-type:grondwater-kwaliteitsmeting"]',
    ).count()
    expect(grondwaterKwaliteitsmetingInSubThema).toBe(1)
  })

  test('selecting a thema must not visually revert the select to its placeholder', async ({ page }) => {
    await expect(page.locator('select#thema')).toBeVisible()
    await expect(page.locator('select#thema option:not([value=""])').first()).toBeAttached()

    // Select a thema — value should persist, not revert to empty string (placeholder)
    await page.selectOption('select#thema', { value: 'riepr-thema-type:lucht' })
    let themaValue = await page.inputValue('select#thema')
    expect(themaValue).not.toBe('')
    expect(themaValue).toBe('riepr-thema-type:lucht')

    // Same check after selecting a sub-thema: both selects must retain their values
    await page.selectOption('select#thema', { value: 'riepr-thema-type:grondwater' })
    await expect(page.locator('select#sub-thema')).toBeVisible()
    await page.selectOption('select#sub-thema', { value: 'riepr-thema-type:grondwater-kwaliteitsmeting' })

    themaValue = await page.inputValue('select#thema')
    const subThemaValue = await page.inputValue('select#sub-thema')
    expect(themaValue).not.toBe('')
    expect(themaValue).toBe('riepr-thema-type:grondwater')
    expect(subThemaValue).not.toBe('')
    expect(subThemaValue).toBe('riepr-thema-type:grondwater-kwaliteitsmeting')
  })

  test('visible labels are present for thema and operationeel fields', async ({ page }) => {
    await expect(page.locator('select#thema')).toBeVisible()

    const themaLabel = page.locator('vl-form-label[for="thema"]')
    await expect(themaLabel).toBeVisible()

    // Lucht has no sub-themas, its relevantRiepr resolves to an operationeel scheme with rendered fields
    await page.selectOption('select#thema', { value: 'riepr-thema-type:lucht' })

    const opFields = page.locator('codelijst-operationeel-fields')
    await expect(opFields).toBeVisible()

    const operationeelLabels = opFields.locator('vl-form-label').count()
    expect(await operationeelLabels).toBeGreaterThan(0)
  })
})
