import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { compileTabularPlan } from '../../poc-json-schema-ods/src/services/tabular-plan.js'
import { ODSGenerator } from '../../poc-json-schema-ods/src/services/ods-generator.js'
import { readOdf } from '../../poc-json-schema-ods/src/services/odf.js'

const load = async (name: string) => JSON.parse(await readFile(
  new URL(`../../poc-json-schema/examples/${name}.json`, import.meta.url), 'utf8'))

test('creates a produced material and destination from a blank form, retaining false and zero', async ({ page }) => {
  await page.goto('/')
  await page.locator('select#productie-jaar').selectOption('2024')
  await page.locator('select#thema').selectOption({ label: 'Grondstoffen' })
  await page.locator('select#doorsnede').selectOption({ label: 'Geproduceerde grondstoffen' })
  const flag = page.locator('td[data-instance-path="/geproduceerd"] select')
  await flag.selectOption({ label: 'Ja' })
  await page.getByRole('button', { name: 'Rij toevoegen', exact: true }).click()
  await page.locator('td[data-instance-path="/grondstof/0/hasResult/material"] select').selectOption({ index: 1 })
  await page.locator('td[data-instance-path="/grondstof/0/hasResult/numericValue"]').getByRole('spinbutton').fill('0')
  await page.locator('td[data-instance-path="/grondstof/0/hasResult/additionalProperty/value"] select')
    .selectOption({ label: 'Dispers gebruik' })
  await page.locator('td[data-row-expand="/grondstof/0"]').getByRole('button').click()
  await page.locator('tr[data-row-details="/grondstof/0"]').getByRole('button', { name: 'Rij toevoegen', exact: true }).click()
  await page.locator('td[data-instance-path="/grondstof/0/qualifiedAssociation/0/type"] select')
    .selectOption({ label: 'Particulier' })
  await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
  const output = page.locator('#validated-json')
  await expect(output).toBeVisible()
  const data = JSON.parse(await output.innerText())
  expect(data.grondstof[0].hasResult.numericValue).toBe(0)
  expect(data.grondstof[0].qualifiedAssociation).toEqual([{
    type: 'https://data.omgeving.vlaanderen.be/id/concept/riepr/operationeel-bestemmingstype/particulier',
  }])
  await flag.selectOption({ label: 'Nee' })
  await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
  await expect(output).toBeVisible()
  expect(JSON.parse(await output.innerText())).toEqual({ geproduceerd: false })
})

for (const [section, name] of [['Geproduceerde grondstoffen', 'grondstof'], ['Inkomende grondstoffen', 'inkomend']]) {
  test(`downloads and imports raw-material reporting: ${section}`, async ({ page }) => {
    await page.goto('/')
    await page.locator('select#productie-jaar').selectOption('2024')
    await page.locator('select#thema').selectOption({ label: 'Grondstoffen' })
    await page.locator('select#doorsnede').selectOption({ label: section })
    const template = await page.getByRole('link', { name: 'ODS-sjabloon downloaden', exact: true }).getAttribute('href')
    const tables = await readOdf(new Uint8Array(await (await page.request.get(template!)).body()))
    expect(tables.map(table => table.name)).toEqual(name === 'grondstof'
      ? ['Voorblad', section, 'Bestemmingen', 'Keuzelijsten', '_riepr']
      : ['Voorblad', section, 'Keuzelijsten', '_riepr'])
    const schemaUrl = await page.getByRole('link', { name: 'Generiek JSON-schema downloaden', exact: true }).getAttribute('href')
    const schema = await (await page.request.get(schemaUrl!)).json()
    if (name === 'inkomend') {
      expect(schema.properties).not.toHaveProperty('geproduceerd')
      await expect(page.locator('td[data-instance-path="/geproduceerd"]')).toHaveCount(0)
    } else {
      await expect(page.locator('td[data-instance-path="/geproduceerd"] select')).toBeVisible()
    }
    const index = await (await page.request.get('/schema/index.json')).json()
    const entry = index.files.find((entry: { id: string }) => entry.id === schema.$id)
    const plan = compileTabularPlan(schema, { sourceSha256: index.sourceSha256, schemaSha256: entry.sha256 })
    const data = await load(`grondstoffen/${name}`)
    const bytes = await new ODSGenerator().generate({
      plan, data, references: await load('refs'), referenceContext: await load('reference-context'),
    })
    await page.getByRole('button', { name: 'Ingevulde ODS importeren', exact: true }).click()
    await page.getByLabel('Ingevulde ODS uploaden', { exact: true }).setInputFiles({
      name: `grondstoffen-${name}.ods`, mimeType: 'application/vnd.oasis.opendocument.spreadsheet', buffer: Buffer.from(bytes),
    })
    await expect(page.getByRole('status')).toContainText('De gegevens staan')
    await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
    await expect(page.locator('#validated-json')).toBeVisible()
    expect(JSON.parse(await page.locator('#validated-json').innerText())).toEqual(data)

    if (name === 'grondstof') {
      const material = page.locator('td[data-instance-path="/grondstof/0/hasResult/material"] select')
      await expect(material.locator('option')).toHaveCount(138)
      await page.locator('td[data-row-expand="/grondstof/0"]').getByRole('button').click()
      const destination = page.locator('td[data-instance-path="/grondstof/0/qualifiedAssociation/0/type"] select')
      await destination.selectOption({ label: 'Particulier' })
      await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
      const updated = JSON.parse(await page.locator('#validated-json').innerText())
      expect(updated.grondstof[0].qualifiedAssociation[0]).toEqual({
        type: 'https://data.omgeving.vlaanderen.be/id/concept/riepr/operationeel-bestemmingstype/particulier',
      })
    } else {
      const field = (path: string) => page.locator(`td[data-instance-path="/inkomend/0/${path}"]`)
      await expect(field('hasFeatureOfInterest').locator('select option')).toHaveCount(4)
      await expect(field('subject').locator('select option')).toHaveCount(4)
      await field('hasFeatureOfInterest').locator('select').selectOption({ label: 'Demo GPBV-installatie GI-03 Terugwinning' })
      await field('subject').locator('select').selectOption({ label: 'Demo activiteit A-03 Terugwinning' })
      await field('hasResult/numericValue').getByRole('spinbutton').fill('0')
      await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
      const updated = JSON.parse(await page.locator('#validated-json').innerText())
      expect(updated.inkomend[0]).toMatchObject({
        hasFeatureOfInterest: 'urn:demo:iepr-installatie:3', subject: 'urn:demo:rubriek:3',
        hasResult: { numericValue: 0 },
      })
    }
  })
}
