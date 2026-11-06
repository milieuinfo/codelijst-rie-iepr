import { test, expect } from '@playwright/test'
import { compileTabularPlan } from '../../poc-json-schema-ods/src/services/tabular-plan.js'
import { ODSGenerator } from '../../poc-json-schema-ods/src/services/ods-generator.js'
import { generationFixture } from '../../poc-json-schema-ods/src/services/generation-fixture.js'
import { readOdf } from '../../poc-json-schema-ods/src/services/odf.js'

for (const [label, key, quantityPath, namePath, sheet] of [
  ['Verbruikte brandstof', 'brandstof', 'brandstofVerbruik/hasResult/numericValue', 'label', 'Brandstoffen'],
  ['Verbruikte stof', 'verbruikteStof', 'hasResult/numericValue', 'label', 'Verbruikte stoffen'],
  ['Geproduceerde stof', 'geproduceerdeStof', 'hasResult/numericValue', 'hasResult/label', 'Geproduceerde stoffen'],
  ['Afvalproduct', 'afvalproduct', 'hasResult/numericValue', 'hasResult/label', 'Afvalproducten'],
] as const) {
  test(`edits, downloads and imports ${label} per installation`, async ({ page }) => {
    await page.goto('/')
    await page.locator('select#productie-jaar').selectOption('2024')
    await page.locator('select#thema').selectOption({ label: 'Lucht' })
    await page.locator('select#doorsnede').selectOption({ label })
    await page.getByRole('button', { name: 'Rij toevoegen', exact: true }).click()
    const field = (path: string) => page.locator(`td[data-instance-path="/${key}/0/${path}"]`)
    const headers = await page.getByRole('columnheader').allTextContents()
    expect(headers[0]).toContain('Installatie')
    expect(headers[1]).toContain('Naam')
    await field('hasFeatureOfInterest').locator('select').selectOption({ index: 1 })
    await field(namePath).getByRole('textbox').fill('Testmateriaal')
    const quantity = field(quantityPath)
    await quantity.getByRole('spinbutton').fill('0')
    if (key !== 'brandstof') {
      const units = quantity.getByRole('combobox', { name: 'Eenheid', exact: true })
      await expect(units.locator('option:not([disabled])')).toHaveCount(7)
      await units.selectOption({ label: 'ton' })
    } else {
      await expect(quantity.getByLabel('Eenheid', { exact: true })).toHaveText('GJ')
    }
    await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
    await expect(page.locator('#validated-json')).toBeVisible()
    const output = JSON.parse(await page.locator('#validated-json').innerText())[key][0]
    expect(output.hasFeatureOfInterest).toEqual(expect.any(String))
    expect(output).not.toHaveProperty('identifier')
    if (key === 'brandstof') {
      expect(output.hasMember).toHaveLength(1)
      await field('brandstofS/hasResult/numericValue').getByRole('spinbutton').fill('100.01')
      await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
      await expect(page.locator('#validated-json')).toHaveCount(0)
      await expect(field('brandstofS/hasResult/numericValue').getByRole('alert')).toBeVisible()
    } else {
      expect(output.hasResult.numericValue).toBe(0)
    }
    const templateUrl = await page.getByRole('link', { name: 'ODS-sjabloon downloaden', exact: true }).getAttribute('href')
    const tables = await readOdf(new Uint8Array(await (await page.request.get(templateUrl!)).body()))
    expect(tables.map(table => table.name)).toEqual(['Voorblad', sheet, 'Keuzelijsten', '_riepr'])
    const schemaUrl = await page.getByRole('link', { name: 'Generiek JSON-schema downloaden', exact: true }).getAttribute('href')
    const schema = await (await page.request.get(schemaUrl!)).json()
    const index = await (await page.request.get('/schema/index.json')).json()
    const entry = index.files.find((entry: { id: string }) => entry.id === schema.$id)
    const plan = compileTabularPlan(schema, { sourceSha256: index.sourceSha256, schemaSha256: entry.sha256 })
    const fixture = (await generationFixture(plan))!
    const bytes = await new ODSGenerator().generate({ plan, ...fixture })
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Ingevulde ODS importeren', exact: true }).click()
    await page.getByLabel('Ingevulde ODS uploaden', { exact: true }).setInputFiles({
      name: 'materiaal.ods', mimeType: 'application/vnd.oasis.opendocument.spreadsheet', buffer: Buffer.from(bytes),
    })
    await expect(page.getByRole('status')).toContainText('De gegevens staan')
    await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
    await expect(page.locator('#validated-json')).toBeVisible()
    expect(JSON.parse(await page.locator('#validated-json').innerText())).toEqual(fixture.data)
  })
}
