import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { compileTabularPlan } from '../../poc-json-schema-ods/src/services/tabular-plan.js'
import { ODSGenerator } from '../../poc-json-schema-ods/src/services/ods-generator.js'
import { readOdf } from '../../poc-json-schema-ods/src/services/odf.js'
import { transformMemberData } from 'codelijst-rie-iepr-poc-json-schema/browser'

test('edits indexed air emissions with composite selections, conditions and pollutant details', async ({ page }) => {
  await page.goto('/')
  await page.locator('select#productie-jaar').selectOption('2024')
  await page.locator('select#thema').selectOption({ label: 'Lucht' })
  await page.locator('select#doorsnede').selectOption({ label: 'Emissie' })
  await page.getByRole('button', { name: 'Rij toevoegen', exact: true }).click()
  const field = (path: string) => page.locator(`td[data-instance-path="/emissie/0/${path}"]`)
  const headers = await page.getByRole('columnheader').allTextContents()
  expect(headers.findIndex(text => text.includes('Emissiepunt'))).toBeLessThan(headers.findIndex(text => text.includes('Bron(nen)')))
  expect(headers.findIndex(text => text.includes('Bron(nen)'))).toBeLessThan(headers.findIndex(text => text.includes('Emissietype')))
  expect(headers.findIndex(text => text.includes('Oorzaak abnormale emissie'))).toBe(headers.findIndex(text => text.includes('Emissietype')) + 1)
  await field('featureEp').locator('select').selectOption({ index: 1 })
  const sources = field('featureBron')
  await sources.getByRole('textbox').fill('GLASOVEN')
  await sources.getByRole('textbox').press('Enter')
  await field('emissieDebiet/hasResult/numericValue').getByRole('spinbutton').fill('0')
  await field('type').locator('select').selectOption({ label: 'Abnormale emissie' })
  await field('emissieOorzaak/value').getByRole('textbox').fill('Tijdelijke storing')
  await page.locator('td[data-row-expand="/emissie/0"]').getByRole('button').click()
  await page.locator('tr[data-row-details="/emissie/0"]').getByRole('button', { name: 'Rij toevoegen', exact: true }).click()
  await field('emissieParameter/0/observedProperty').locator('select').selectOption({ label: 'Ammoniak' })
  await field('emissieParameter/0/hasResult/numericValue').getByRole('spinbutton').fill('1.25')
  await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
  await expect(page.locator('#validated-json')).toBeVisible()
  const data = JSON.parse(await page.locator('#validated-json').innerText()).emissie[0]
  expect(data.featureEp).toEqual(expect.any(String))
  expect(data.featureBron).toHaveLength(1)
  expect(data).not.toHaveProperty('identifier')
  expect(data.hasMember).toContainEqual(expect.objectContaining({ hasResult: expect.objectContaining({ numericValue: 0 }) }))
  expect(data.additionalProperty).toContainEqual(expect.objectContaining({ value: 'Tijdelijke storing' }))
  await field('type').locator('select').selectOption({ label: 'Geleide emissie' })
  await expect(field('emissieOorzaak/value').getByRole('textbox')).toBeDisabled()
  await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
  const active = JSON.parse(await page.locator('#validated-json').innerText()).emissie[0]
  expect(active.additionalProperty ?? []).not.toContainEqual(expect.objectContaining({ value: 'Tijdelijke storing' }))
  await field('type').locator('select').selectOption({ label: 'Abnormale emissie' })
  await expect(field('emissieOorzaak/value').getByRole('textbox')).toHaveValue('Tijdelijke storing')
})

test('downloads and imports the current air workbook without technical emission identifiers', async ({ page }) => {
  await page.goto('/')
  await page.locator('select#productie-jaar').selectOption('2024')
  await page.locator('select#thema').selectOption({ label: 'Lucht' })
  await page.locator('select#doorsnede').selectOption({ label: 'Emissie' })
  const template = await page.getByRole('link', { name: 'ODS-sjabloon downloaden', exact: true }).getAttribute('href')
  expect(template).toContain('lucht-emissies.ods')
  const tables = await readOdf(new Uint8Array(await (await page.request.get(template!)).body()))
  expect(tables.some(table => table.name === 'Emissiegehelen')).toBe(true)
  const schemaUrl = await page.getByRole('link', { name: 'Generiek JSON-schema downloaden', exact: true }).getAttribute('href')
  const schema = await (await page.request.get(schemaUrl!)).json()
  const index = await (await page.request.get('/schema/index.json')).json()
  const entry = index.files.find((entry: { id: string }) => entry.id === schema.$id)
  const plan = compileTabularPlan(schema, { sourceSha256: index.sourceSha256, schemaSha256: entry.sha256 })
  const load = async (path: string) => JSON.parse(await readFile(new URL(`../../poc-json-schema/examples/${path}.json`, import.meta.url), 'utf8'))
  const data = await load('lucht/emissie')
  const bytes = await new ODSGenerator().generate({
    plan, data, references: await load('refs'), referenceContext: await load('reference-context'),
  })
  await page.getByRole('button', { name: 'Ingevulde ODS importeren', exact: true }).click()
  await page.getByLabel('Ingevulde ODS uploaden', { exact: true }).setInputFiles({
    name: 'lucht-emissies.ods', mimeType: 'application/vnd.oasis.opendocument.spreadsheet', buffer: Buffer.from(bytes),
  })
  await expect(page.getByRole('status')).toContainText('De gegevens staan')
  await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
  await expect(page.locator('#validated-json')).toBeVisible()
  expect(JSON.parse(await page.locator('#validated-json').innerText())).toEqual(
    transformMemberData(schema, transformMemberData(schema, data, 'presentation'), 'canonical'),
  )
})
