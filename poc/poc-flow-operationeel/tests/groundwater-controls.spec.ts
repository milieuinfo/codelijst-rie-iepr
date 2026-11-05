import { test, expect, type Page } from '@playwright/test'
import type { SchemaRichTable } from '../src/components/schema-rich-table.js'

test.use({ timezoneId: 'Europe/Brussels', viewport: { width: 1440, height: 1000 } })

const field = (page: Page, path: string) => page.locator(`td[data-instance-path="${path}"]`)
async function openSection(page: Page, section: string) {
  await page.goto('/')
  await page.locator('select#productie-jaar').selectOption('2026')
  await page.locator('select#thema').selectOption({ label: 'Grondwater' })
  await page.locator('select#doorsnede').selectOption({ label: section })
  await page.getByRole('button', { name: 'Rij toevoegen', exact: true }).click()
}

test('uses the Flux date-time picker and stores local input as a valid UTC timestamp', async ({ page }) => {
  await openSection(page, 'Peilmeting')
  const cell = field(page, '/peilmeting/0/resultTime')
  const picker = cell.locator('vl-datepicker')
  await expect(picker).toHaveAttribute('type', 'date-time')
  await picker.getByRole('textbox').fill('05.11.2026 14:30')
  await picker.getByRole('textbox').blur()
  await field(page, '/peilmeting/0/hasResult/numericValue').locator('input').fill('0')
  await field(page, '/peilmeting/0/hasResult/peilmetingReferentiepunt/value').locator('select').selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
  const output = page.locator('#validated-json')
  await expect(output).toBeVisible()
  const measurement = JSON.parse(await output.innerText()).peilmeting[0]
  expect(measurement.resultTime).toBe('2026-11-05T13:30:00.000Z')
  expect(measurement.hasResult).not.toHaveProperty('peilmetingReferentiepunt')
  expect(measurement.hasResult.additionalProperty).toEqual([expect.objectContaining({
    propertyID: 'https://data.omgeving.vlaanderen.be/id/concept/riepr/operationeel-grondwater/peilmeting-referentiepunt',
    value: expect.any(String),
  })])
  await picker.getByRole('button', { name: /datumkiezer/ }).click()
  await expect(picker.locator('.flatpickr-calendar')).toBeVisible()
  await expect(picker.locator('.flatpickr-hour')).toBeVisible()
  await expect(picker.locator('.flatpickr-minute')).toBeVisible()
  await picker.getByRole('button', { name: 'november 6, 2026, vrijdag', exact: true }).click()
  await picker.getByRole('button', { name: /datumkiezer/ }).click()
  await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
  await expect(output).toBeVisible()
  expect(JSON.parse(await output.innerText()).peilmeting[0].resultTime).toBe('2026-11-06T13:30:00.000Z')
  await picker.getByRole('textbox').fill('')
  await picker.getByRole('textbox').blur()
  await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
  expect(JSON.parse(await output.innerText()).peilmeting[0].resultTime).toBeUndefined()
})

test('preserves invalid date-time input for visible validation errors', async ({ page }) => {
  await openSection(page, 'Peilmeting')
  const cell = field(page, '/peilmeting/0/resultTime')
  await cell.getByRole('textbox').fill('invalid-datetime')
  await cell.getByRole('textbox').blur()
  await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
  await expect(cell.getByRole('alert')).toBeVisible()
  await expect(page.locator('#validated-json')).toHaveCount(0)
})

test('uses date-only pickers without changing calendar dates', async ({ page }) => {
  await openSection(page, 'Onttrekking/infiltratie')
  const picker = field(page, '/onttrekking/0/onttrekkingHoeveelheid/resultTime').locator('vl-datepicker')
  await expect(picker).toHaveAttribute('type', 'date')
  await picker.getByRole('textbox').fill('05.11.2026')
  await picker.getByRole('textbox').blur()
  await expect(picker).toHaveJSProperty('value', '2026-11-05')
  await field(page, '/onttrekking/0/type').locator('select').selectOption({ label: 'Onttrekking' })
  await field(page, '/onttrekking/0/additionalProperty/value').locator('select').selectOption({ label: 'Nee' })
  await field(page, '/onttrekking/0/onttrekkingHoeveelheid/hasResult/numericValue').getByRole('spinbutton').fill('0')
  await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
  await expect(page.locator('#validated-json')).toBeVisible()
  const record = JSON.parse(await page.locator('#validated-json').innerText()).onttrekking[0]
  expect(record).not.toHaveProperty('onttrekkingHoeveelheid')
  expect(record).not.toHaveProperty('onttrekkingSpui')
  expect(record.additionalProperty).toEqual([{
    propertyID: 'https://data.omgeving.vlaanderen.be/id/concept/riepr/operationeel-grondwater/onttrekking-spui',
    value: false,
  }])
  expect(record.hasMember).toEqual([expect.objectContaining({
    observedProperty: 'https://data.omgeving.vlaanderen.be/id/concept/riepr/operationeel-grondwater/onttrekking-hoeveelheid',
    resultTime: '2026-11-05', hasResult: expect.objectContaining({ numericValue: 0 }),
  })])
  await field(page, '/onttrekking/0/onttrekkingStartmeterstand/hasResult/numericValue').getByRole('spinbutton').fill('12')
  const quantity = field(page, '/onttrekking/0/onttrekkingHoeveelheid/hasResult/numericValue')
  await quantity.getByRole('spinbutton').fill('')
  await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
  await expect(page.locator('#validated-json')).toHaveCount(0)
  await expect(quantity.getByRole('alert')).toBeVisible()
})

test('keeps simple rows compact and deletes with an accessible icon-only button', async ({ page }) => {
  await openSection(page, 'Peilmeting')
  await expect(page.getByRole('columnheader', { name: 'Rij', exact: true })).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: 'Eenheid', exact: true })).toHaveCount(0)
  const numeric = field(page, '/peilmeting/0/hasResult/numericValue')
  await expect(numeric.getByRole('spinbutton')).toBeVisible()
  await expect(numeric.getByLabel('Eenheid', { exact: true })).toHaveText('m')
  const action = page.locator('td[data-row-actions="/peilmeting/0"]')
  const button = action.getByRole('button', { name: 'Rij verwijderen', exact: true })
  await expect(action.locator('vl-button')).toHaveAttribute('icon', 'bin')
  await expect(button).toHaveText('')
  const height = await action.evaluate(cell => cell.getBoundingClientRect().height)
  expect(height).toBeLessThanOrEqual(52)
  expect(height).toBeGreaterThanOrEqual(35)
  await button.focus()
  await page.keyboard.press('Enter')
  await expect(action).toHaveCount(0)
})

test('keeps selectable units beside the value and preserves their JSON path', async ({ page }) => {
  await openSection(page, 'Peilmeting')
  await page.locator('schema-rich-table').evaluate(element => {
    const table = element as SchemaRichTable
    const unit = table.editor.schemaAt(['peilmeting', 0, 'hasResult', 'hasUnit'])
    delete unit.const
    delete unit.default
    unit.enum = ['urn:test:unit:m', 'urn:test:unit:cm']
    table.requestUpdate()
  })
  const cell = field(page, '/peilmeting/0/hasResult/numericValue')
  await expect(page.getByRole('columnheader', { name: 'Eenheid', exact: true })).toHaveCount(0)
  await cell.getByRole('spinbutton').fill('12')
  await cell.getByRole('combobox', { name: 'Eenheid', exact: true }).selectOption({ label: 'urn:test:unit:cm' })
  const value = await page.locator('schema-rich-table').evaluate(element =>
    (element as SchemaRichTable).editor.get(['peilmeting', 0, 'hasResult']))
  expect(value).toEqual({ numericValue: 12, hasUnit: 'urn:test:unit:cm' })
})

test('edits repeated measurements only in full-width expandable details', async ({ page }) => {
  await openSection(page, 'Kwaliteitsmeting')
  const add = page.getByRole('button', { name: 'Rij toevoegen', exact: true })
  await expect(add).toHaveCount(1)
  await add.click()
  await expect(page.getByRole('columnheader', { name: 'Meetresultaten', exact: true })).toHaveCount(0)
  const expand = page.locator('td[data-row-expand="/kwaliteitsmeting/0"]')
  await expect(expand).toHaveJSProperty('cellIndex', 0)
  await expand.getByRole('button', { name: 'Details uitklappen', exact: true }).press('Enter')
  const details = page.locator('tr[data-row-details="/kwaliteitsmeting/0"]')
  await expect(details).toBeVisible()
  await expect(expand.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  const dimensions = await details.evaluate(row => {
    const parent = row.previousElementSibling as HTMLTableRowElement
    const cell = row.firstElementChild as HTMLTableCellElement
    return { span: cell.colSpan, columns: parent.cells.length,
      width: row.getBoundingClientRect().width, parentWidth: parent.getBoundingClientRect().width }
  })
  expect(dimensions.span).toBe(dimensions.columns)
  expect(dimensions.width).toBeCloseTo(dimensions.parentWidth, 0)
  await details.getByRole('button', { name: 'Rij toevoegen', exact: true }).click()
  const value = field(page, '/kwaliteitsmeting/0/kwaliteitsmetingResultaten/0/hasResult/numericValue').getByRole('spinbutton')
  await value.fill('12.5')
  await expand.getByRole('button', { name: 'Details inklappen', exact: true }).click()
  await expect(details).toBeHidden()
  await expect(page.getByRole('button', { name: 'Rij toevoegen', exact: true })).toHaveCount(1)
  await expand.getByRole('button', { name: 'Details uitklappen', exact: true }).click()
  await expect(value).toHaveValue('12.5')
  await page.locator('td[data-row-expand="/kwaliteitsmeting/1"]').getByRole('button').click()
  const second = page.locator('tr[data-row-details="/kwaliteitsmeting/1"]')
  await second.getByRole('button', { name: 'Rij toevoegen', exact: true }).click()
  await field(page, '/kwaliteitsmeting/1/kwaliteitsmetingResultaten/0/hasResult/numericValue').getByRole('spinbutton').fill('7')
  await page.locator('td[data-row-actions="/kwaliteitsmeting/0"]').getByRole('button').click()
  await expect(field(page, '/kwaliteitsmeting/0/kwaliteitsmetingResultaten/0/hasResult/numericValue').getByRole('spinbutton')).toHaveValue('7')
  await page.locator('td[data-row-actions="/kwaliteitsmeting/0/kwaliteitsmetingResultaten/0"]').getByRole('button').click()
  await expect(field(page, '/kwaliteitsmeting/0/kwaliteitsmetingResultaten/0/hasResult/numericValue')).toHaveCount(0)
})

test('opens collapsed details for validation errors without preventing manual collapse', async ({ page }) => {
  await openSection(page, 'Kwaliteitsmeting')
  const reference = field(page, '/kwaliteitsmeting/0/additionalProperty')
  await reference.getByRole('textbox').fill('Referentiepunt 1')
  await reference.getByRole('option', { name: 'Referentiepunt 1', exact: true }).click()
  await field(page, '/kwaliteitsmeting/0/kwaliteitsmetingDiepte/hasResult/numericValue').getByRole('spinbutton').fill('0')
  const expand = page.locator('td[data-row-expand="/kwaliteitsmeting/0"]').getByRole('button')
  await expand.click()
  const details = page.locator('tr[data-row-details="/kwaliteitsmeting/0"]')
  await details.getByRole('button', { name: 'Rij toevoegen', exact: true }).click()
  await field(page, '/kwaliteitsmeting/0/kwaliteitsmetingResultaten/0/observedProperty').locator('select').selectOption({ index: 1 })
  await field(page, '/kwaliteitsmeting/0/kwaliteitsmetingResultaten/0/hasResult/numericValue')
    .locator('vl-input-field').evaluate(input =>
      input.dispatchEvent(new CustomEvent('vl-input', { detail: { value: 'invalid-number' } })))
  await expand.click()
  await expect(details).toBeHidden()
  await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
  await expect(details).toBeVisible()
  await expect(field(page, '/kwaliteitsmeting/0/kwaliteitsmetingResultaten/0/hasResult/numericValue').getByRole('alert')).toBeVisible()
  await expand.click()
  await expect(details).toBeHidden()
})
