import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { compileTabularPlan } from '../../poc-json-schema-ods/src/services/tabular-plan.js'
import { ODSGenerator } from '../../poc-json-schema-ods/src/services/ods-generator.js'
import { readOdf } from '../../poc-json-schema-ods/src/services/odf.js'
import { transformMemberData } from 'codelijst-rie-iepr-poc-json-schema/browser'
import { DataFactory, Parser, Store } from 'n3'

test('shares declared material keys across forms, personalized ODS and RDF, and rejects renamed targets', async ({ page }) => {
  await page.goto('/')
  await page.locator('select#productie-jaar').selectOption('2024')
  await page.locator('select#thema').selectOption({ label: 'Lucht' })
  await page.locator('select#doorsnede').selectOption({ label: 'Verbruikte brandstof' })
  await page.getByRole('button', { name: 'Fictieve voorbeeldgegevens invullen', exact: true }).click()
  await page.locator('select#doorsnede').selectOption({ label: 'Emissie' })
  await page.getByRole('button', { name: 'Fictieve voorbeeldgegevens invullen', exact: true }).click()
  const materials = page.locator('td[data-instance-path="/emissie/0/used"]')
  await materials.locator('[role="combobox"]').click()
  await materials.getByRole('textbox').fill('Aardgas')
  await expect(materials.getByRole('option')).toHaveCount(1)
  await materials.getByRole('textbox').press('Enter')
  await expect(materials.getByRole('listbox').first()).toContainText('Aardgas')
  await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
  const output = page.locator('#validated-json')
  await expect(output).toBeVisible()
  const data = JSON.parse(await output.innerText())
  expect(data.emissie[0].used).toHaveLength(1)
  await page.getByRole('tab', { name: 'Turtle', exact: true }).click()
  const graph = new Store(new Parser().parse(await page.locator('#validated-turtle').innerText()))
  const fuel = graph.getSubjects(DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#label'),
    DataFactory.literal('Aardgas'), null)[0]
  expect(fuel).toBeDefined()
  expect(graph.getSubjects(DataFactory.namedNode('http://www.w3.org/ns/prov#used'), fuel, null)).toHaveLength(1)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'ODS-sjabloon downloaden', exact: true }).click(),
  ])
  expect(download.suggestedFilename()).toBe('lucht-emissies.ods')
  const path = await download.path()
  if (!path) throw new Error('The personalized workbook was not downloaded.')
  const tables = await readOdf(new Uint8Array(await readFile(path)))
  expect(tables.find(table => table.name === 'Keuzelijsten')!.rows.some(row =>
    row.cells.some(cell => cell.text.includes('Aardgas')))).toBe(true)
  const schemaUrl = await page.getByRole('link', { name: 'Generiek JSON-schema downloaden', exact: true }).getAttribute('href')
  const schema = await (await page.request.get(schemaUrl!)).json()
  const personalUrl = await page.getByRole('link', { name: 'Persoonlijk JSON-schema downloaden', exact: true }).getAttribute('href')
  const personal = await page.evaluate(async url => (await fetch(url!)).json(), personalUrl)
  const index = await (await page.request.get('/schema/index.json')).json()
  const entry = index.files.find((entry: { id: string }) => entry.id === schema.$id)
  const plan = compileTabularPlan(schema, { sourceSha256: index.sourceSha256, schemaSha256: entry.sha256 })
  const bytes = await new ODSGenerator().generate({
    plan, data, references: personal['x-reference-snapshot'].references, referenceContext: { year: 2024 },
  })
  await page.getByRole('button', { name: 'Ingevulde ODS importeren', exact: true }).click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByLabel('Ingevulde ODS uploaden', { exact: true }).setInputFiles({
    name: 'lucht-emissies.ods', mimeType: 'application/vnd.oasis.opendocument.spreadsheet', buffer: Buffer.from(bytes),
  })
  await expect(page.getByRole('status')).toContainText('De gegevens staan')
  await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
  await expect(output).toBeVisible()
  expect(JSON.parse(await output.innerText())).toEqual(data)
  await page.getByRole('button', { name: 'Ingevulde ODS importeren', exact: true }).click()
  await page.locator('select#doorsnede').selectOption({ label: 'Verbruikte brandstof' })
  await page.getByRole('textbox', { name: 'Naam', exact: true }).first().fill('Andere brandstof')
  await page.locator('select#doorsnede').selectOption({ label: 'Emissie' })
  await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
  await expect(output).not.toBeVisible()
  await page.getByRole('button', { name: 'Ingevulde ODS importeren', exact: true }).click()
  await page.getByLabel('Ingevulde ODS uploaden', { exact: true }).setInputFiles({
    name: 'lucht-emissies.ods', mimeType: 'application/vnd.oasis.opendocument.spreadsheet', buffer: Buffer.from(bytes),
  })
  await expect(page.locator('vl-alert[title="ODS kon niet worden ingelezen"]')).toBeVisible()
})

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
  await sources.locator('[role="combobox"]').click()
  await sources.getByRole('textbox').fill('GLASOVEN')
  await expect(sources.getByRole('option')).toHaveCount(1)
  await sources.getByRole('textbox').press('Enter')
  await expect(sources.getByRole('listbox').first()).toContainText('GLASOVEN')
  await field('emissieDebiet/hasResult/numericValue').getByRole('spinbutton').fill('0')
  await field('type').locator('select').selectOption({ label: 'Abnormale emissie' })
  await field('emissieOorzaak/value').getByRole('textbox').fill('Tijdelijke storing')
  await page.locator('td[data-row-expand="/emissie/0"]').getByRole('button').click()
  await page.locator('tr[data-row-details="/emissie/0"]').getByRole('button', { name: 'Rij toevoegen', exact: true }).click()
  await page.getByRole('combobox', { name: 'Stof', exact: true }).selectOption({ label: 'Ammoniak' })
  await page.getByRole('textbox', { name: 'Naam controle-instantie', exact: true }).fill('Fictief controlelabo')
  await page.getByRole('spinbutton', { name: 'Concentratie', exact: true }).fill('0')
  await page.getByRole('spinbutton', { name: 'Massastroom', exact: true }).fill('1.25')
  await page.getByRole('spinbutton', { name: 'Jaaremissie', exact: true }).fill('12.5')
  await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
  await expect(page.locator('#validated-json')).toBeVisible()
  const data = JSON.parse(await page.locator('#validated-json').innerText()).emissie[0]
  expect(data.featureEp).toEqual(expect.any(String))
  expect(data.featureBron).toHaveLength(1)
  expect(data).not.toHaveProperty('identifier')
  expect(data.hasMember).toContainEqual(expect.objectContaining({ hasResult: expect.objectContaining({ numericValue: 0 }) }))
  expect(data.additionalProperty).toContainEqual(expect.objectContaining({ value: 'Tijdelijke storing' }))
  const pollutant = data.hasMember.find((member: Record<string, unknown>) => member['@type'])
  expect(pollutant).not.toHaveProperty('observedProperty')
  expect(pollutant.wasAssociatedWith).toEqual({ label: 'Fictief controlelabo' })
  const quantity = (name: string) => pollutant.hasMember.find((member: { observedProperty: string }) =>
    member.observedProperty.endsWith(`/emissie_parameter_${name}`)).hasResult.numericValue
  expect(quantity('concentratie')).toBe(0)
  expect(quantity('massastroom')).toBe(1.25)
  expect(quantity('jaaremissie')).toBe(12.5)
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
