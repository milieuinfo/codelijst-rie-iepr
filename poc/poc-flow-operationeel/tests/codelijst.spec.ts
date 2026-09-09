import { test, expect, type Page } from '@playwright/test'

interface ConsoleError {
  type: string
  text: string
}

/**
 * Select the productie-jaar. The app gates the thema selector behind a
 * production-year choice, so every test must do this before touching `#thema`.
 */
async function selectProductionYear(page: Page) {
  await expect(page.locator('select#productie-jaar')).toBeVisible()
  await page.selectOption('select#productie-jaar', { value: String(new Date().getFullYear()) })
}

/**
 * Select the water thema and drive the feature (controlleinrichting) structural
 * picker to flow-navigate into the operationeel_water_lozing sub-scheme, where
 * `lozing` and `abnormale-lozing` are the top-level concepts (repeatable
 * composite groups). Returns the last (active) operationeel-fields locator.
 */
async function selectWaterLozing(page: Page) {
  await page.selectOption('select#thema', { value: 'thema:water' })
  const opFields = page.locator('codelijst-operationeel-fields')
  await expect(opFields).toBeVisible()
  // feature → controleinrichting single-select (flow-navigate to operationeel_water_lozing)
  await opFields.last().locator('select').first().selectOption({ index: 1 })
  await expect(opFields).toHaveCount(2)
  return opFields.last()
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
    await selectProductionYear(page)
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

  test('flat thema model: selecting a thema renders its operationeel fields with no sub-thema selector', async ({ page }) => {
    // The thema hierarchy was flattened: every thema is a leaf concept that maps
    // directly (via seeAlso) to its operationeel scheme. There are no sub-themas,
    // so the sub-thema selector must never appear for any thema.
    await expect(page.locator('select#thema')).toBeVisible()

    // Grondwater → operationeel_grondwater (no sub-thema)
    await page.selectOption('select#thema', { value: 'thema:grondwater' })
    await expect(page.locator('select#sub-thema')).not.toBeVisible()
    await expect(page.locator('codelijst-operationeel-fields')).toBeVisible()

    // Lucht → operationeel_lucht (still no sub-thema)
    await page.selectOption('select#thema', { value: 'thema:lucht' })
    await expect(page.locator('select#sub-thema')).not.toBeVisible()
    await expect(page.locator('codelijst-operationeel-fields')).toBeVisible()
  })

  test('selecting a thema without children that maps to operationeel scheme renders fields', async ({ page }) => {
    // Lucht has no sub-themas but its relevantRiepr -> conceptscheme:operationeel_lucht
    await expect(page.locator('select#thema')).toBeVisible()
    await page.selectOption('select#thema', { value: 'thema:lucht' })

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

  test('selecting the water thema renders its operationeel feature picker', async ({ page }) => {
    // Flat model: water → operationeel_water, whose single top concept is the
    // `feature` (Controlleinrichting) structural picker. No sub-thema is involved.
    await page.selectOption('select#thema', { value: 'thema:water' })
    await expect(page.locator('select#sub-thema')).not.toBeVisible()

    const opFields = page.locator('codelijst-operationeel-fields')
    await expect(opFields).toBeVisible()

    // The feature picker renders as a structural select of mock instances.
    expect(await opFields.locator('vl-select').count()).toBeGreaterThan(0)
  })

  test('repeatable field add button works without console errors', async ({ page }) => {
    // Afvalproduct in lucht scheme has isMeervoudig=true and renders a "+ Nog afvalproduct toevoegen" button
    await page.selectOption('select#thema', { value: 'thema:lucht' })

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

  test('thema selector lists exactly the six flat thema concepts and nothing else', async ({ page }) => {
    await expect(page.locator('select#thema')).toBeVisible()
    await expect(page.locator('select#thema option:not([value=""])').first()).toBeAttached()

    // With the hierarchy flattened, the thema selector must contain exactly the six
    // leaf thema concepts — no sub-themas and no operationeel/concept-scheme leakage.
    const expected = [
      'thema:grondstoffen',
      'thema:grondwater',
      'thema:lucht',
      'thema:water',
      'thema:zelfcontrole-lucht',
      'thema:zelfcontrole-water',
    ]
    const optionValues = await page
      .locator('select#thema option:not([value=""])')
      .evaluateAll(options => options.map(o => o.value))
    expect(optionValues).toHaveLength(6)
    for (const value of expected) {
      expect(optionValues).toContain(value)
    }
  })

  test('selecting a thema must not visually revert the select to its placeholder', async ({ page }) => {
    await expect(page.locator('select#thema')).toBeVisible()
    await expect(page.locator('select#thema option:not([value=""])').first()).toBeAttached()

    // Select a thema — value should persist, not revert to empty string (placeholder)
    await page.selectOption('select#thema', { value: 'thema:lucht' })
    let themaValue = await page.inputValue('select#thema')
    expect(themaValue).not.toBe('')
    expect(themaValue).toBe('thema:lucht')

    // Switching to another flat thema must also persist (and reveal no sub-thema)
    await page.selectOption('select#thema', { value: 'thema:grondwater' })
    await expect(page.locator('select#sub-thema')).not.toBeVisible()
    themaValue = await page.inputValue('select#thema')
    expect(themaValue).not.toBe('')
    expect(themaValue).toBe('thema:grondwater')
  })

  test('visible labels are present for thema and operationeel fields', async ({ page }) => {
    await expect(page.locator('select#thema')).toBeVisible()

    const themaLabel = page.locator('vl-form-label[for="thema"]')
    await expect(themaLabel).toBeVisible()

    // Lucht has no sub-themas, its relevantRiepr resolves to an operationeel scheme with rendered fields
    await page.selectOption('select#thema', { value: 'thema:lucht' })

    const opFields = page.locator('codelijst-operationeel-fields')
    await expect(opFields).toBeVisible()

    const operationeelLabels = opFields.locator('vl-form-label').count()
    expect(await operationeelLabels).toBeGreaterThan(0)
  })

  // --- Required-field rendering tests (water thema → operationeel_water scheme) ---

  test('required member text field carries required signal in a repeatable composite', async ({ page }) => {
    // Water thema → operationeel_water (feature picker) → operationeel_water_lozing,
    // where "Lozing" is a repeatable composite group. Its child
    // "Aantal dagen per jaar" (lozing-dagen) renders inside the first instance
    // with a #1 suffix.
    const opFields = await selectWaterLozing(page)

    // "Aantal dagen per jaar" is a required xsd:string field → vl-input-field type="text" ?required=true
    const requiredInput = opFields.locator('vl-input-field#water\\:lozing-dagen\\#1')
    await expect(requiredInput).toBeVisible()
    const requiredAttr = await requiredInput.getAttribute('required')
    const requiredProp = await requiredInput.evaluate(el => (el as HTMLElement & { required?: boolean }).required ?? false)
    expect(requiredAttr).toBe('')
    expect(requiredProp).toBe(true)
  })

  test('non-required child text input does not carry required signal', async ({ page }) => {
    // Within the repeatable composite group "Abnormale lozing", children get #1 suffix.
    // "Verklaring" (abnormale-lozing-verklaring) has no isVerplicht → NOT required.
    const opFields = await selectWaterLozing(page)

    const nonRequiredInput = opFields.locator('vl-input-field#water\\:abnormale-lozing-verklaring\\#1')
    await expect(nonRequiredInput).toBeVisible()
    const attr = await nonRequiredInput.getAttribute('required')
    const prop = await nonRequiredInput.evaluate(el => (el as HTMLElement & { required?: boolean }).required ?? false)
    expect(attr).toBeNull()
    expect(prop).toBe(false)
  })

  test('required number input within composite fieldset carries required signal', async ({ page }) => {
    // "Lozingsduur" (abnormale-lozing-lozingsduur) has isVerplicht=true and relevantDataType=xsd:integer
    // → renders as vl-input-field type="number" with required. Inside repeatable composite → #1 suffix.
    const opFields = await selectWaterLozing(page)

    const reqNumber = opFields.locator('vl-input-field#water\\:abnormale-lozing-lozingsduur\\#1')
    await expect(reqNumber).toBeVisible()
    const attr = await reqNumber.getAttribute('required')
    const prop = await reqNumber.evaluate(el => (el as HTMLElement & { required?: boolean }).required ?? false)
    expect(attr).toBe('')
    expect(prop).toBe(true)
  })

  test('non-required select within composite fieldset does not carry required signal', async ({ page }) => {
    // "Bepalingsmethode" (lozing-bepalingsmethode) inside the repeatable "Lozing" group
    // has no isVerplicht, relevantCodeList→operationeel_bepalingsmethode (internal scheme) → populated select.
    const opFields = await selectWaterLozing(page)

    const nonReqSelect = opFields.locator('vl-select#water\\:lozing-bepalingsmethode\\#1')
    await expect(nonReqSelect).toBeVisible()
    const attr = await nonReqSelect.getAttribute('required')
    const prop = await nonReqSelect.evaluate(el => (el as HTMLElement & { required?: boolean }).required ?? false)
    expect(attr).toBeNull()
    expect(prop).toBe(false)
  })

  test('required decimal input within a repeatable composite member carries required signal', async ({ page }) => {
    // "Debiet per jaar" (lozing-debiet) inside the repeatable "Lozing" group has
    // isVerplicht=true and relevantDataType=xsd:decimal → renders as
    // vl-input-field type="number" with required, in the first instance (#1).
    const opFields = await selectWaterLozing(page)

    const reqDecimal = opFields.locator('vl-input-field#water\\:lozing-debiet\\#1')
    await expect(reqDecimal).toBeVisible()
    const attr = await reqDecimal.getAttribute('required')
    const prop = await reqDecimal.evaluate(el => (el as HTMLElement & { required?: boolean }).required ?? false)
    expect(attr).toBe('')
    expect(prop).toBe(true)
  })

  test('relevantCodeList vl-select must not revert after unrelated field interaction triggers full re-render', async ({ page }) => {
    // Regression test for SELECT-VALUE-REVERT bug: every @input handler called requestUpdate(),
    // causing a full re-render. Each re-render created a fresh .options array passed to <vl-select>,
    // which triggered the child component's updated() lifecycle, clearing its internal value.
    // The fix adds explicit .value binding and selected flags to all vl-select controls.
    const opFields = await selectWaterLozing(page)

    // Select a value in the relevantCodeList select (lozing-bepalingsmethode#1)
    const bepalingSelect = opFields.locator('vl-select#water\\:lozing-bepalingsmethode\\#1')
    await expect(bepalingSelect).toBeVisible()
    await page.selectOption('select#water\\:lozing-bepalingsmethode\\#1', { value: 'bepalingsmethode:gemeten' })

    // Verify initial selection persisted
    let selectValue = await page.inputValue('select#water\\:lozing-bepalingsmethode\\#1')
    expect(selectValue).toBe('bepalingsmethode:gemeten')

    // Trigger a full re-render of ALL fields by clicking a button in the same component tree.
    // The addInstance/removeInstance methods call requestUpdate() which re-renders all fields,
    // exercising the same code path as @input handlers but without needing to interact with
    // web-component shadow DOM internals that Playwright cannot reach directly.
    const addButton = opFields.locator('vl-button', { hasText: /Nog.*toevoegen/ }).first()
    if (await addButton.isVisible()) {
      await addButton.click()
    } else {
      // No repeatable field in this scheme — click the "Verwijder" button on the composite group instead
      const removeButton = opFields.locator('vl-button', { hasText: 'Verwijder' }).first()
      if (await removeButton.isVisible()) {
        await removeButton.click()
      }
    }

    // After the re-render caused by typing in the unrelated field,
    // the relevantCodeList select must STILL show its previously selected value.
    selectValue = await page.inputValue('select#water\\:lozing-bepalingsmethode\\#1')
    expect(selectValue).toBe('bepalingsmethode:gemeten')
  })

   test('conditional visibility — conditionPath/conditionValue shows/hides fields based on trigger field value', async ({ page }) => {
     // Inject synthetic conditionPath/conditionValue into the real codelist data via page.route()
     // so we can exercise this code path end-to-end without modifying files on disk.
     await page.route('**/rie-iepr.jsonld', async route => {
       const response = await route.fetch()
       const json = await response.json() as Record<string, unknown>
       if (Array.isArray(json.graph)) {
         for (const node of json.graph) {
           const types: string[] = ((node._type ?? node['@type']) as string | undefined)?.toString().split(',') || []
           if (!types.includes('skos:Concept')) continue
           const id: string = (node.id ?? node['@id'] ?? '') as string
               // lozing-dagen is a child of the repeatable "Lozing" group (renders with #1 suffix)
             // Its trigger reference points to bepalingsmethode#1, a sibling child of the same group
            if (id === 'water:lozing-dagen') {
             node.condition_path = 'water:lozing-bepalingsmethode#1'
             node.condition_value = 'bepalingsmethode:gemeten'
           }
           // lozing-debiet same pattern — root concept, no suffix; uses geschat as trigger value
           if (id === 'water:lozing-debiet') {
             node.condition_path = 'water:lozing-bepalingsmethode#1'
             node.condition_value = 'bepalingsmethode:geschat'
           }
         }
       }
       await route.fulfill({ response, json })
     })

      await page.goto('/')
      await selectProductionYear(page)
      // Navigate into operationeel_water_lozing (feature → controleinrichting), where
      // "Lozing" is a repeatable composite group carrying the conditioned child
      // fields (lozing-dagen / lozing-debiet) with a #1 suffix.
      await page.selectOption('select#thema', { value: 'thema:water' })
      const opFields = page.locator('codelijst-operationeel-fields')
      await expect(opFields).toBeVisible()
      await opFields.last().locator('select').first().selectOption({ index: 1 })
      await expect(opFields).toHaveCount(2)

      // Conditioned fields — neither should be visible initially (no trigger value selected yet)
      const dagenField = opFields.locator('vl-input-field#water\\:lozing-dagen\\#1')
      const debietField = opFields.locator('vl-input-field#water\\:lozing-debiet\\#1')
     await expect(dagenField).not.toBeVisible()
     await expect(debietField).not.toBeVisible()

     // Select matching value for lozing-dagen's condition (trigger has #1 suffix as child of composite root)
     await page.selectOption('select#water\\:lozing-bepalingsmethode\\#1', {
       value: 'bepalingsmethode:gemeten',
     })

     // lozing-dagen should NOW appear, but lozing-debiet should still hide
     await expect(dagenField).toBeVisible({ timeout: 3000 })
     await expect(debietField).not.toBeVisible()

     // Switch to a different option that matches lozing-debiet's condition
     await page.selectOption('select#water\\:lozing-bepalingsmethode\\#1', {
       value: 'bepalingsmethode:geschat',
     })

      // Now lozing-debiet should show and lozing-dagen should hide (exact-match logic)
      await expect(debietField).toBeVisible({ timeout: 3000 })
      await expect(dagenField).not.toBeVisible()
    })

    // --- rapportering scheme: relevantClass is side info only, groups are plain repeatable composites ---

    test('rapportering groups render as plain repeatable composites with a relevantClass tooltip', async ({ page }) => {
      // Lucht → operationeel_lucht (feature_ep) → operationeel_lucht_bron (feature_bron)
      // → operationeel_lucht_rapportering, whose top-level concepts (afvalproduct,
      // geproduceerde_stof, brandstof, verbruikte_stof) all carry
      // relevantClass: sosa:ObservationCollection + isMeervoudig. The POC ignores
      // relevantClass behaviorally — each concept renders as a plain repeatable
      // composite group with its own child fields, no synthesized
      // emissiepunt/meetpunt or periode controls, no lid-observatie nesting.
      // The relevantClass value is shown as a hover tooltip (title attribute) only.
      //
      // feature_bron is a multiselect in the real codelist (hidden <select multiple>),
      // awkward to drive headlessly. The scenario only needs the flow to reach the
      // rapportering scheme, so downgrade feature_bron to a single-select to make the
      // navigation step deterministic.
      await page.route('**/rie-iepr.jsonld', async route => {
        const response = await route.fetch()
        const json = await response.json() as Record<string, unknown>
        const patch = (value: unknown): void => {
          if (!value || typeof value !== 'object') return
          if (Array.isArray(value)) { value.forEach(patch); return }
          const node = value as Record<string, unknown>
          if (node.id === 'lucht:feature_bron' || node['@id'] === 'lucht:feature_bron') {
            node.isMultiselect = 'false'
            node.is_multiselect = 'false'
          }
          for (const v of Object.values(node)) patch(v)
        }
        patch(json)
        await route.fulfill({ response, json })
      })

      await page.goto('/')
      await selectProductionYear(page)
      await page.selectOption('select#thema', { value: 'thema:lucht' })
      const opFields = page.locator('codelijst-operationeel-fields')
      await expect(opFields).toBeVisible()

      // Step 1: feature_ep → schoorsteen structural picker (flow-navigate to bron)
      await opFields.last().locator('select').first().selectOption({ index: 1 })
      await expect(opFields).toHaveCount(2)

      // Step 2: feature_bron → installatie structural picker (flow-navigate to rapportering)
      await opFields.last().locator('select').first().selectOption({ index: 1 })
      await expect(opFields).toHaveCount(3)

      // The rapportering step (last) holds the four root groups.
      const rapportering = opFields.last()

      // One repeatable composite group per top-level concept (4 in this scheme).
      await expect(rapportering.locator('.codelijst-group')).toHaveCount(4)
      const afvalGroup = rapportering.locator('.codelijst-group', { hasText: 'Afvalproduct' })
      await expect(afvalGroup).toBeVisible()

      // relevantClass is side information only: exposed as a hover tooltip on the
      // group (and its fieldset legend), never as rendered form controls.
      await expect(afvalGroup).toHaveAttribute('title', 'relevantClass: sosa:ObservationCollection')
      await expect(afvalGroup.locator('span[slot="legend"]', { hasText: 'Afvalproduct 1' })).toHaveAttribute('title', 'relevantClass: sosa:ObservationCollection')

      // No synthesized envelope controls and no lid-observatie nesting.
      await expect(rapportering.locator('vl-input-field[id$="__hasFeatureOfInterest"]')).toHaveCount(0)
      await expect(rapportering.locator('vl-datepicker[id$="__created"]')).toHaveCount(0)
      await expect(rapportering.locator('text=Lid-observatie')).toHaveCount(0)

      // The group's first instance carries its own child fields with a #1 suffix:
      // naam (first), aard, hoeveelheid.
      await expect(afvalGroup.locator('vl-input-field#lucht\\:afvalproduct_naam\\#1')).toBeVisible()
      await expect(afvalGroup.locator('vl-input-field#lucht\\:afvalproduct_aard\\#1')).toBeVisible()
      await expect(afvalGroup.locator('vl-input-field#lucht\\:afvalproduct_hoeveelheid\\#1')).toBeVisible()

      // The brandstof group renders its own fields as well (naam, as, s, verbruik).
      const brandstofGroup = rapportering.locator('.codelijst-group', { hasText: 'Verbruikte brandstof' })
      await expect(brandstofGroup.locator('vl-input-field#lucht\\:brandstof_naam\\#1')).toBeVisible()
      await expect(brandstofGroup.locator('vl-input-field#lucht\\:brandstof_verbruik\\#1')).toBeVisible()

      // "+ Nog afvalproduct toevoegen" grows only this group's instance list.
      const instancesBefore = await afvalGroup.locator('vl-fieldset').count()
      await afvalGroup.locator('vl-button', { hasText: /Nog afvalproduct toevoegen/ }).click()
      const instancesAfter = await afvalGroup.locator('vl-fieldset').count()
      expect(instancesAfter).toBe(instancesBefore + 1)
      // The new instance's fields appear with a #2 suffix; the original #1 fields persist.
      await expect(afvalGroup.locator('span[slot="legend"]', { hasText: 'Afvalproduct 2' })).toBeVisible()
      await expect(afvalGroup.locator('vl-input-field#lucht\\:afvalproduct_aard\\#2')).toBeVisible()
      await expect(afvalGroup.locator('vl-input-field#lucht\\:afvalproduct_aard\\#1')).toBeVisible()
    })
  })
