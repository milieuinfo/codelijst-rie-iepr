import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { compileTabularPlan } from '../../poc-json-schema-ods/src/services/tabular-plan.js'
import { ODSGenerator } from '../../poc-json-schema-ods/src/services/ods-generator.js'
import { readOdf } from '../../poc-json-schema-ods/src/services/odf.js'

test('edits annual water flows and nested pollutant results with numeric frequency', async ({ page }) => {
  await page.goto('/')
  await page.locator('select#productie-jaar').selectOption('2024')
  await page.locator('select#thema').selectOption({ label: 'Water' })
  await page.locator('select#doorsnede').selectOption({ label: 'Waterstroom' })
  await page.getByRole('button', { name: 'Rij toevoegen', exact: true }).click()
  const field = (path: string) => page.locator(`td[data-instance-path="/lozing/0/${path}"]`)
  await field('hasFeatureOfInterest').locator('select').selectOption({ label: 'Controleinrichting LP01 Industrieel glasfabriek' })
  await field('lozingDebiet/hasResult/numericValue').getByRole('spinbutton').fill('125000')
  await field('lozingDagen/hasResult/numericValue').getByRole('spinbutton').fill('365')
  await page.locator('td[data-row-expand="/lozing/0"]').getByRole('button').click()
  await page.locator('tr[data-row-details="/lozing/0"]').getByRole('button', { name: 'Rij toevoegen', exact: true }).click()
  await field('lozingParameter/0/lozingStof/value').locator('select')
    .selectOption({ label: 'Cadmium' })
  await field('lozingParameter/0/lozingMeetfrequentie/value').getByRole('spinbutton').fill('0')
  await field('lozingParameter/0/lozingConcentratie/hasResult/numericValue').getByRole('spinbutton').fill('0')
  await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
  await expect(page.locator('#validated-json')).toBeVisible()
  const data = JSON.parse(await page.locator('#validated-json').innerText()).lozing[0]
  expect(data.hasMember.find((member: { observedProperty?: string }) => member.observedProperty?.endsWith('/lozing-debiet'))
    .hasResult.hasUnit).toBe('https://data.omgeving.vlaanderen.be/id/concept/csor/eenheid/E_32')
  const parameter = data.hasMember.find((member: Record<string, unknown>) => member['@type'])
  expect(parameter).not.toHaveProperty('observedProperty')
  expect(parameter.additionalProperty).toContainEqual(expect.objectContaining({ value: 0 }))
  expect(parameter.hasMember).toEqual([expect.objectContaining({ hasResult: expect.objectContaining({ numericValue: 0 }) })])
  await field('lozingParameter/0/lozingMeetfrequentie/value').getByRole('spinbutton').fill('-1')
  await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
  await expect(page.locator('#validated-json')).not.toBeVisible()
})

test('reports water use per origin with a non-negative decimal m³ volume', async ({ page }) => {
  await page.goto('/')
  await page.locator('select#productie-jaar').selectOption('2024')
  await page.locator('select#thema').selectOption({ label: 'Water' })
  await page.locator('select#doorsnede').selectOption({ label: 'Watergebruik' })
  await page.getByRole('button', { name: 'Rij toevoegen', exact: true }).click()
  await page.getByRole('combobox', { name: 'Installatie', exact: true }).selectOption({ label: 'GLASOVEN' })
  await page.getByRole('combobox', { name: 'Herkomst', exact: true }).selectOption({ label: 'Hemelwater' })
  const volume = page.getByRole('spinbutton', { name: 'Onttrokken hoeveelheid', exact: true })
  await volume.fill('0')
  await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
  const output = page.locator('#validated-json')
  await expect(output).toBeVisible()
  expect(JSON.parse(await output.innerText()).watergebruik[0].hasFeatureOfInterest)
    .toBe('urn:demo:process:urn%3Ademo%3Ainstallatie%3A1')
  expect(JSON.parse(await output.innerText()).watergebruik[0].hasResult).toEqual({
    numericValue: 0,
    hasUnit: 'https://data.omgeving.vlaanderen.be/id/concept/csor/eenheid/E_32',
    additionalProperty: [{
      propertyID: 'https://data.omgeving.vlaanderen.be/id/concept/riepr/operationeel-water/watergebruik-herkomst',
      value: 'https://data.omgeving.vlaanderen.be/id/concept/riepr/operationeel-water/herkomst-hemelwater',
    }],
  })
  await volume.fill('-0.5')
  await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
  await expect(output).not.toBeVisible()
})

for (const [section, label, filename, businessSheets] of [
  ['lozing', 'Waterstroom', 'water-lozingen.ods', ['Waterstromen', 'Stoffen in waterstromen']],
  ['abnormale-lozing', 'Abnormale lozing', 'water-abnormale-lozingen.ods', ['Abnormale lozingen']],
  ['watergebruik', 'Watergebruik', 'water-watergebruik.ods', ['Watergebruik']],
] as const) {
  test(`downloads and imports the indexed ${section} workbook`, async ({ page }) => {
    await page.goto('/')
    await page.locator('select#productie-jaar').selectOption('2024')
    await page.locator('select#thema').selectOption({ label: 'Water' })
    await page.locator('select#doorsnede').selectOption({ label })
    const template = await page.getByRole('link', { name: 'ODS-sjabloon downloaden', exact: true }).getAttribute('href')
    expect(template).toContain(filename)
    const tables = await readOdf(new Uint8Array(await (await page.request.get(template!)).body()))
    expect(tables.map(table => table.name)).toEqual(['Voorblad', ...businessSheets, 'Keuzelijsten', '_riepr'])
    const schemaUrl = await page.getByRole('link', { name: 'Generiek JSON-schema downloaden', exact: true }).getAttribute('href')
    const schema = await (await page.request.get(schemaUrl!)).json()
    const index = await (await page.request.get('/schema/index.json')).json()
    const entry = index.files.find((entry: { id: string }) => entry.id === schema.$id)
    const plan = compileTabularPlan(schema, { sourceSha256: index.sourceSha256, schemaSha256: entry.sha256 })
    const load = async (path: string) => JSON.parse(await readFile(new URL(`../../poc-json-schema/examples/${path}.json`, import.meta.url), 'utf8'))
    const data = await load(`water/${section}`)
    const bytes = await new ODSGenerator().generate({
      plan, data, references: await load('refs'), referenceContext: await load('reference-context'),
    })
    await page.getByRole('button', { name: 'Ingevulde ODS importeren', exact: true }).click()
    await page.getByLabel('Ingevulde ODS uploaden', { exact: true }).setInputFiles({
      name: filename, mimeType: 'application/vnd.oasis.opendocument.spreadsheet', buffer: Buffer.from(bytes),
    })
    await expect(page.getByRole('status')).toContainText('De gegevens staan')
    await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
    await expect(page.locator('#validated-json')).toBeVisible()
    expect(JSON.parse(await page.locator('#validated-json').innerText())).toEqual(data)
  })
}
