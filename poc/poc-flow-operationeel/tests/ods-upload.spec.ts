import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { ODSGenerator } from '../../poc-json-schema-ods/src/services/ods-generator.js'
import { compileTabularPlan } from '../../poc-json-schema-ods/src/services/tabular-plan.js'
import { generationFixture } from '../../poc-json-schema-ods/src/services/generation-fixture.js'
import { loadSchemaIndex } from '../../poc-json-schema-ods/src/services/schema-index.js'
import { schemaObject, SchemaValidator } from 'codelijst-rie-iepr-poc-json-schema/browser'
import { join } from 'node:path'
import { modifyTable, tableRows } from '../../poc-json-schema-ods/tests/fixtures.js'
import { readOdf, workbookMetadata } from 'codelijst-rie-iepr-poc-json-schema-ods/browser'

async function workbook(name: string, label?: (value: string) => string) {
  const input = join(import.meta.dirname, '../public')
  const index = loadSchemaIndex(input)
  const entry = index.files.find(entry => entry.kind === 'section' && entry.path.includes(`/${name}/`))!
  const schema = schemaObject(JSON.parse(await readFile(join(input, 'schema', entry.path), 'utf8')))
  const plan = compileTabularPlan(schema, { sourceSha256: index.sourceSha256, schemaSha256: entry.sha256 })
  const fixture = (await generationFixture(plan))!
  const bytes = await new ODSGenerator().generate({ plan, ...fixture, label })
  return { bytes, data: fixture.data }
}

test('uploads a downloaded blank template after its business cells are filled', async ({ page }) => {
  await select(page, 'Kwaliteitsmeting')
  const url = await page.getByRole('link', { name: 'ODS-sjabloon downloaden', exact: true }).getAttribute('href')
  if (!url) throw new Error('Missing template URL.')
  let blank = new Uint8Array(await (await page.request.get(url)).body())
  const tables = await readOdf(blank)
  const metadata = workbookMetadata(JSON.parse(tables.find(table => table.name === '_riepr')!.rows.slice(1)
    .map(row => row.cells[0].text).join('')))
  const labels = new Map(Object.values(metadata.lookups).flatMap(choices => choices.map(choice => [choice.value, choice.display] as const)))
  const populated = await workbook('kwaliteitsmeting', value => labels.get(value) ?? value)
  for (const sheet of ['Monsters', 'Meetresultaten']) {
    const rows = await tableRows(populated.bytes, sheet)
    blank = await modifyTable(blank, sheet, original => [...original.slice(0, 3), ...rows.slice(3)])
  }
  const documentId = await page.evaluate(() => performance.timeOrigin)
  await upload(page, blank)
  await expect(page.getByRole('status')).toContainText('De gegevens staan')
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentId)
  await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
  await expect(page.locator('#validated-json')).toBeVisible()
  expect(JSON.parse(await page.locator('#validated-json').innerText())).toEqual(populated.data)
})

async function select(page: Page, name: string, year = '2024') {
  await page.goto('/')
  await page.locator('select#productie-jaar').selectOption(year)
  await page.locator('select#thema').selectOption({ label: 'Grondwater' })
  await page.locator('select#doorsnede').selectOption({ label: name })
}

async function upload(page: Page, bytes: Uint8Array, name = 'ingevuld.ods') {
  const toggle = page.getByRole('button', { name: 'Ingevulde ODS importeren', exact: true })
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click()
  await page.getByLabel('Ingevulde ODS uploaden', { exact: true }).setInputFiles({
    name, mimeType: 'application/vnd.oasis.opendocument.spreadsheet', buffer: Buffer.from(bytes),
  })
}

test('hides the upload form behind a button and imports without navigation or reload', async ({ page }) => {
  const source = await workbook('peilmeting')
  await select(page, 'Peilmeting')
  const toggle = page.getByRole('button', { name: 'Ingevulde ODS importeren', exact: true })
  const form = page.getByRole('group', { name: 'ODS importeren', includeHidden: true })
  await expect(form).toBeHidden()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(form).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await toggle.click()
  await expect(form).toBeHidden()
  const documentId = await page.evaluate(() => performance.timeOrigin)
  let navigations = 0
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++ })
  await upload(page, source.bytes)
  await expect(page.getByRole('status')).toContainText('De gegevens staan')
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentId)
  expect(navigations).toBe(0)
  await expect(page.locator('select#productie-jaar')).toHaveValue('2024')
  await toggle.click()
  await expect(form).toBeHidden()
  await expect(page.locator('td[data-instance-path="/peilmeting/0/hasResult/numericValue"] input')).toHaveValue('-2.125')
})

for (const [name, label, valuePath, value] of [
  ['onttrekking', 'Onttrekking/infiltratie', '/onttrekking/0/onttrekkingHoeveelheid/hasResult/numericValue', '0'],
  ['peilmeting', 'Peilmeting', '/peilmeting/0/hasResult/numericValue', '-2.125'],
  ['kwaliteitsmeting', 'Kwaliteitsmeting', '/kwaliteitsmeting/0/kwaliteitsmetingDiepte/hasResult/numericValue', '-2.125'],
] as const) {
  test(`uploads ${name} into editable UI and preserves its complete JSON`, async ({ page }) => {
    // LAN HTTP has getRandomValues, but not secure-context-only crypto APIs.
    await page.addInitScript(() => {
      Object.defineProperty(crypto, 'subtle', { value: undefined })
      Object.defineProperty(crypto, 'randomUUID', { value: undefined })
    })
    const source = await workbook(name)
    await select(page, label)
    await upload(page, source.bytes)
    await expect(page.getByRole('status')).toContainText('De gegevens staan in het formulier.')
    await expect(page.locator(`td[data-instance-path="${valuePath}"] input`)).toHaveValue(value)
    if (name === 'kwaliteitsmeting') {
      await expect(page.locator('td[data-instance-path="/kwaliteitsmeting/0/wasAssociatedWith/label"] input'))
        .toHaveValue('Synthetisch laboratorium')
      await page.locator('td[data-row-expand="/kwaliteitsmeting/0"]').getByRole('button').click()
      await expect(page.locator('td[data-instance-path="/kwaliteitsmeting/0/kwaliteitsmetingResultaten/0/hasResult/numericValue"] input'))
        .toHaveValue('0')
    }
    await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
    await expect(page.locator('#validated-json')).toBeVisible()
    expect(JSON.parse(await page.locator('#validated-json').innerText())).toEqual(source.data)
    await page.getByRole('tab', { name: 'Turtle', exact: true }).click()
    await expect(page.locator('#validated-turtle')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Turtle downloaden', exact: true })).toBeVisible()
    await page.getByRole('tab', { name: 'JSON', exact: true }).click()
    const download = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Persoonlijk JSON-schema downloaden', exact: true }).click()
    const personal = await download
    const path = await personal.path()
    if (!path) throw new Error('Missing personalized schema after ODS import.')
    const personalSchema = JSON.parse(await readFile(path, 'utf8'))
    expect(new SchemaValidator().validateInstance(personalSchema, source.data).valid).toBe(true)
    expect(personalSchema['x-reference-snapshot'].references.some((reference: { id: string }) =>
      reference.id.startsWith('urn:test:'))).toBe(true)
    await page.locator(`td[data-instance-path="${valuePath}"] input`).fill('1.5')
    await expect(page.locator('#validated-json')).toHaveCount(0)
    await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
    await expect(page.locator('#validated-json')).toContainText('1.5')
  })
}

test('rejects wrong sections, malformed files and wrong years without losing the draft', async ({ page }) => {
  const quality = await workbook('kwaliteitsmeting')
  const level = await workbook('peilmeting')
  await select(page, 'Peilmeting')
  await upload(page, level.bytes)
  await expect(page.getByRole('status')).toContainText('De gegevens staan')
  const value = page.locator('td[data-instance-path="/peilmeting/0/hasResult/numericValue"] input')
  await value.fill('7')
  await upload(page, quality.bytes)
  await expect(page.locator('vl-alert[title="ODS kon niet worden ingelezen"]')).toContainText('schema/source version')
  await expect(value).toHaveValue('7')
  await upload(page, new TextEncoder().encode('not a workbook'))
  await expect(page.locator('vl-alert[title="ODS kon niet worden ingelezen"]')).toBeVisible()
  await expect(value).toHaveValue('7')
  await page.locator('select#productie-jaar').selectOption('2026')
  await upload(page, level.bytes)
  await expect(page.locator('vl-alert[title="ODS kon niet worden ingelezen"]')).toContainText('2024')
  await expect(page.locator('td[data-instance-path="/peilmeting/0/hasResult/numericValue"]')).toHaveCount(0)
  await page.locator('select#productie-jaar').selectOption('2024')
  await expect(value).toHaveValue('7')
})

test('requires confirmation to replace existing data and allows retrying the same file', async ({ page }) => {
  const source = await workbook('peilmeting')
  await select(page, 'Peilmeting')
  await upload(page, source.bytes)
  await expect(page.getByRole('status')).toContainText('De gegevens staan')
  const value = page.locator('td[data-instance-path="/peilmeting/0/hasResult/numericValue"] input')
  await value.fill('7')
  page.once('dialog', dialog => dialog.dismiss())
  await upload(page, source.bytes)
  await expect(page.locator('#ods-upload')).toBeEnabled()
  await expect(value).toHaveValue('7')
  page.once('dialog', dialog => dialog.accept())
  await upload(page, source.bytes)
  await expect(page.getByRole('status')).toContainText('De gegevens staan')
  await expect(value).toHaveValue('-2.125')
})
