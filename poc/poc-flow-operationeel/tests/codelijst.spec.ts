import { test, expect, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'

const field = (page: Page, path: string) => page.locator(`td[data-instance-path="${path}"]`)
async function selectTheme(page: Page, name: string) {
  await page.goto('/')
  await page.locator('select#productie-jaar').selectOption(String(new Date().getFullYear()))
  await page.locator('select#thema').selectOption({ label: name })
}
async function section(page: Page, name: string) {
  await page.locator('select#doorsnede').selectOption({ label: name })
}

test.describe('Schema-driven rich tables', () => {
  const errors: string[] = []
  test.beforeEach(async ({ page }) => {
    errors.length = 0
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  })
  test.afterEach(() => { expect(errors).toEqual([]) })

  test('loads the indexed sections and explicitly reports incomplete coverage', async ({ page }) => {
    await selectTheme(page, 'Grondwater')
    await expect(page.locator('h1')).toHaveText('RIE-IEPR Codelijst POC')
    await expect(page.locator('vl-alert[title="Onvolledige schemasnapshot"]')).toBeVisible()
    await expect(page.locator('select#thema option:not([value=""])')).toHaveCount(6)
    await expect(page.locator('select#doorsnede option:not([value=""])')).toHaveCount(3)
    await expect(page.locator('codelijst-operationeel-fields')).toHaveCount(0)
    await expect(page.locator('vl-rich-data-table').first()).toBeVisible()
  })

  for (const [theme, label] of [
    ['Grondwater', 'Kwaliteitsmeting'], ['Grondwater', 'Onttrekking/infiltratie'], ['Grondwater', 'Peilmeting'],
    ['Lucht', 'Verbruikte brandstof'], ['Lucht', 'Emissie'],
    ['Water', 'Lozing'], ['Water', 'Abnormale lozing'], ['Zelfcontrole water', 'Meting'],
  ]) {
    test(`renders and adds records for ${theme} / ${label} without runtime errors`, async ({ page }) => {
      await selectTheme(page, theme)
      await section(page, label)
      await page.locator('schema-rich-table').last().getByRole('button', { name: 'Rij toevoegen', exact: true }).click()
      await expect(page.locator('td[data-row-actions]').first()).toBeVisible()
      await expect(page.locator('vl-alert[title="Schemaformulier niet beschikbaar"]')).toHaveCount(0)
    })
  }

  test('displays blocked source diagnostics instead of an invented editable form', async ({ page }) => {
    await selectTheme(page, 'Grondstoffen')
    await expect(page.getByText("Voor dit thema zijn nog geen geldige rapportageschema's beschikbaar.")).toBeVisible()
    await page.locator('summary').click()
    await expect(page.getByText(/Unresolved unit references/)).toBeVisible()
    await expect(page.getByText(/has no top concepts/)).toBeVisible()
    await expect(page.locator('schema-rich-table')).toHaveCount(0)
  })

  test('edits independent nested parameter rows directly within their measurement owner', async ({ page }) => {
    await selectTheme(page, 'Zelfcontrole water')
    await page.locator('schema-rich-table').last().getByRole('button', { name: 'Rij toevoegen', exact: true }).click()
    await expect(field(page, '/meting/0/hasMember')).toBeVisible()
    await field(page, '/meting/0/hasMember').getByRole('button', { name: 'Rij toevoegen', exact: true }).click()
    await field(page, '/meting/0/hasMember/0/hasResult/numericValue').locator('input').pressSequentially('12.125')
    await expect(field(page, '/meting/0/hasMember/0/hasResult/numericValue').locator('input')).toHaveValue('12.125')
    const parentTable = page.locator('schema-rich-table').filter({ has: field(page, '/meting/0/hasMember') }).first()
    await parentTable.getByRole('button', { name: 'Rij toevoegen', exact: true }).last().click()
    await field(page, '/meting/1/hasMember').getByRole('button', { name: 'Rij toevoegen', exact: true }).click()
    await field(page, '/meting/1/hasMember/0/hasResult/numericValue').locator('input').fill('98.5')
    await field(page, '/meting/0/hasMember').getByRole('button', { name: 'Rij toevoegen', exact: true }).click()
    await field(page, '/meting/0/hasMember/1/hasResult/numericValue').locator('input').fill('20')
    await page.locator('td[data-row-actions="/meting/0"]').getByRole('button', { name: 'Rij verwijderen', exact: true }).click()
    await expect(field(page, '/meting/0/hasMember/0/hasResult/numericValue').locator('input')).toHaveValue('98.5')
    await expect(field(page, '/meting/1/hasMember')).toHaveCount(0)
    await expect(page.getByText(/parent.?id|rij-id/i)).toHaveCount(0)
  })

  test('keeps reference multiselects inside one context cell and restores per-section/year drafts', async ({ page }) => {
    await selectTheme(page, 'Lucht')
    const references = field(page, '/featureBron').locator('vl-select-rich')
    await references.locator('[role="combobox"]').click()
    await references.getByRole('option', { name: 'GLASOVEN', exact: true }).click()
    await references.locator('[role="combobox"]').click()
    await references.getByRole('option', { name: 'Centrifuge', exact: true }).click()
    await expect(references).toContainText('GLASOVEN')
    await expect(references).toContainText('Centrifuge')
    await section(page, 'Emissie')
    await section(page, 'Verbruikte brandstof')
    await expect(references).toContainText('GLASOVEN')
    await expect(references).toContainText('Centrifuge')
    const year = String(new Date().getFullYear())
    await page.locator('select#productie-jaar').selectOption(String(Number(year) - 1))
    await expect(references.locator('.vl-select__list--multiple')).not.toContainText('GLASOVEN')
    await page.locator('select#productie-jaar').selectOption(year)
    await expect(references).toContainText('GLASOVEN')
    await expect(references).toContainText('Centrifuge')
  })

  test('reports required/type/format errors at data paths and never displays success JSON on failure', async ({ page }) => {
    await selectTheme(page, 'Grondwater')
    await section(page, 'Peilmeting')
    await page.locator('schema-rich-table').last().getByRole('button', { name: 'Rij toevoegen', exact: true }).click()
    await field(page, '/peilmeting/0/resultTime').getByRole('textbox').fill('invalid-datetime')
    await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
    await expect(page.getByRole('list', { name: 'Validatiefouten' })).toContainText('/peilmeting/0/hasResult/numericValue')
    await expect(page.getByRole('list', { name: 'Validatiefouten' })).toContainText('/peilmeting/0/referentiepunt')
    await expect(page.getByRole('list', { name: 'Validatiefouten' })).toContainText('/peilmeting/0/resultTime')
    await expect(page.locator('#validated-json')).toHaveCount(0)
    await expect(field(page, '/peilmeting/0/resultTime').getByRole('alert')).toBeVisible()
  })

  test('greys out inactive cells, restores drafts and excludes inactive data from validated JSON', async ({ page }) => {
    await selectTheme(page, 'Grondwater')
    await section(page, 'Peilmeting')
    const table = page.locator('schema-rich-table').last()
    await table.getByRole('button', { name: 'Rij toevoegen', exact: true }).click()
    const still = field(page, '/peilmeting/0/hasResult/duurStil/value')
    await expect(still.locator('input')).toBeDisabled()
    const state = field(page, '/peilmeting/0/hasResult/pomptoestand/value').locator('select')
    await state.selectOption({ label: 'Rust' })
    await expect(still.locator('input')).toBeEnabled()
    await still.locator('input').fill('PT8H')
    await state.selectOption({ label: 'In werking' })
    await expect(still).toHaveAttribute('aria-disabled', 'true')
    await expect(still.locator('input')).toBeDisabled()
    await expect(still.locator('input')).toHaveValue('PT8H')
    await field(page, '/peilmeting/0/hasResult/numericValue').locator('input').fill('0')
    await field(page, '/peilmeting/0/referentiepunt').locator('select').selectOption({ index: 1 })
    await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
    const json = page.locator('#validated-json')
    await expect(json).toBeVisible()
    const output = JSON.parse(await json.innerText())
    expect(output.peilmeting[0].hasResult.duurStil).toBeUndefined()
    expect(output.peilmeting[0].hasResult.volumeRust).toBeUndefined()
    expect(output.peilmeting[0].hasResult.numericValue).toBe(0)
    await state.selectOption({ label: 'Rust' })
    await expect(still.locator('input')).toHaveValue('PT8H')
    await expect(json).toHaveCount(0)
    await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
    await expect(json).toContainText('PT8H')
  })

  test('rejects a modified indexed schema and displays a visible loading error', async ({ page }) => {
    await page.route('**/schema/grondwater/peilmeting/schema.json', async route => {
      const response = await route.fetch()
      const json = await response.json()
      await route.fulfill({ json: { ...json, title: 'Modified schema' } })
    })
    await page.goto('/')
    await expect(page.locator('vl-alert[title="Schemaformulier niet beschikbaar"]')).toBeVisible()
    await expect(page.locator('vl-alert[title="Schemaformulier niet beschikbaar"]')).toHaveAttribute('message', /Schema wijkt af/)
    await expect(page.locator('select#thema')).toHaveCount(0)
  })

  for (const invalid of ['reference', 'condition']) {
    test(`reports invalid ${invalid} annotations as visible errors rather than unhandled render failures`, async ({ page }) => {
      const response = await page.request.get('/schema/grondwater/peilmeting/schema.json')
      const schema = await response.json()
      if (invalid === 'reference') schema['x-reference-types'] = [17]
      else schema.properties.peilmeting.items.properties.resultTime['x-visible-when'] = { sourceConcept: 'urn:missing', values: [true] }
      const body = JSON.stringify(schema)
      await page.route('**/schema/grondwater/peilmeting/schema.json', route => route.fulfill({ contentType: 'application/json', body }))
      await page.route('**/schema/index.json', async route => {
        const response = await route.fetch()
        const index = await response.json()
        for (const entry of index.files) {
          if (entry.path === 'grondwater/peilmeting/schema.json') entry.sha256 = createHash('sha256').update(body).digest('hex')
        }
        await route.fulfill({ json: index })
      })
      await selectTheme(page, 'Grondwater')
      await section(page, 'Peilmeting')
      if (invalid === 'condition') {
        await page.locator('schema-rich-table').last().getByRole('button', { name: 'Rij toevoegen', exact: true }).click()
      }
      await expect(page.locator('vl-alert[title="Schemaformulier niet beschikbaar"]')).toHaveAttribute('message',
        invalid === 'reference' ? /Ongeldige structurele referentietypes/ : /Onopgeloste of dubbelzinnige schemavoorwaarde/)
      await expect(page.locator('#validated-json')).toHaveCount(0)
    })
  }
})
