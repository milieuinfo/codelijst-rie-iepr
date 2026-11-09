import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { compileTabularPlan } from '../../poc-json-schema-ods/src/services/tabular-plan.js'
import { ODSGenerator } from '../../poc-json-schema-ods/src/services/ods-generator.js'
import { readOdf } from '../../poc-json-schema-ods/src/services/odf.js'

test.use({ timezoneId: 'Europe/Brussels' })

for (const [theme, slug, point, pollutant] of [
  ['Zelfcontrole lucht', 'zelfcontrole-lucht', 'Schouw glasoven', 'Stikstofoxiden'],
  ['Zelfcontrole water', 'zelfcontrole-water', 'Controleinrichting LP01 Industrieel glasfabriek', 'Cadmium'],
]) {
  test(`edits timestamp, units and optional parameter characteristics: ${theme}`, async ({ page }) => {
    await page.goto('/')
    await page.locator('select#productie-jaar').selectOption('2024')
    await page.locator('select#thema').selectOption({ label: theme })
    await page.locator('select#doorsnede').selectOption({ label: 'Metingen' })
    await page.getByRole('button', { name: 'Rij toevoegen', exact: true }).click()
    const field = (path: string) => page.locator(`td[data-instance-path="/meting/0/${path}"]`)
    await field('hasFeatureOfInterest').locator('select').selectOption({ label: point })
    const date = field('resultTime').getByRole('textbox')
    await date.fill('03.06.2024 10:30')
    await date.blur()
    await page.locator('td[data-row-expand="/meting/0"]').getByRole('button').click()
    await page.locator('tr[data-row-details="/meting/0"]').getByRole('button', { name: 'Rij toevoegen', exact: true }).click()
    await field('hasMember/0/observedProperty').locator('select').selectOption({ label: pollutant })
    const concentration = field('hasMember/0/hasResult/numericValue')
    await concentration.getByRole('spinbutton').fill('0')
    await concentration.locator('select').selectOption({ index: 1 })
    const uncertainty = field('hasMember/0/hasResult/parameterMeetonzekerheid/value')
    await uncertainty.getByRole('spinbutton').fill('0')
    await field('hasMember/0/hasResult/parameterMeetfrequentie/value').getByRole('textbox').fill('Maandelijks')
    if (slug === 'zelfcontrole-water') {
      await field('hasMember/0/hasResult/parameterSoort/value').locator('select').selectOption({ label: 'Schepmonster' })
    }
    await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
    const output = page.locator('#validated-json')
    await expect(output).toBeVisible()
    const measurement = JSON.parse(await output.innerText()).meting[0]
    expect(measurement.resultTime).toBe('2024-06-03T08:30:00.000Z')
    expect(measurement).not.toHaveProperty('wasAssociatedWith')
    expect(measurement.hasMember[0].hasResult.numericValue).toBe(0)
    expect(measurement.hasMember[0].hasResult.additionalProperty).toContainEqual(expect.objectContaining({ value: 0 }))
    await uncertainty.getByRole('spinbutton').fill('101')
    await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
    await expect(output).not.toBeVisible()
  })

  test(`downloads and imports the two-sheet self-control workbook: ${theme}`, async ({ page }) => {
    await page.goto('/')
    await page.locator('select#productie-jaar').selectOption('2024')
    await page.locator('select#thema').selectOption({ label: theme })
    await page.locator('select#doorsnede').selectOption({ label: 'Metingen' })
    const template = await page.getByRole('link', { name: 'ODS-sjabloon downloaden', exact: true }).getAttribute('href')
    expect(template).toContain(`${slug}.ods`)
    const tables = await readOdf(new Uint8Array(await (await page.request.get(template!)).body()))
    expect(tables.map(table => table.name)).toEqual(['Voorblad', 'Metingen', 'Meetresultaten', 'Keuzelijsten', '_riepr'])
    const schemaUrl = await page.getByRole('link', { name: 'Generiek JSON-schema downloaden', exact: true }).getAttribute('href')
    const schema = await (await page.request.get(schemaUrl!)).json()
    const index = await (await page.request.get('/schema/index.json')).json()
    const entry = index.files.find((entry: { id: string }) => entry.id === schema.$id)
    const plan = compileTabularPlan(schema, { sourceSha256: index.sourceSha256, schemaSha256: entry.sha256 })
    const load = async (path: string) => JSON.parse(await readFile(new URL(`../../poc-json-schema/examples/${path}.json`, import.meta.url), 'utf8'))
    const data = await load(`${slug}/meting`)
    const bytes = await new ODSGenerator().generate({
      plan, data, references: await load('refs'), referenceContext: await load('reference-context'),
    })
    await page.getByRole('button', { name: 'Ingevulde ODS importeren', exact: true }).click()
    await page.getByLabel('Ingevulde ODS uploaden', { exact: true }).setInputFiles({
      name: `${slug}.ods`, mimeType: 'application/vnd.oasis.opendocument.spreadsheet', buffer: Buffer.from(bytes),
    })
    await expect(page.getByRole('status')).toContainText('De gegevens staan')
    await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()
    await expect(page.locator('#validated-json')).toBeVisible()
    expect(JSON.parse(await page.locator('#validated-json').innerText())).toEqual(data)
  })
}
