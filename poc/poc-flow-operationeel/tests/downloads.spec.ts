import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { readOdf } from '../../poc-json-schema-ods/src/services/odf.js'
import { SchemaValidator, schemaObject, type JsonSchemaObject } from 'codelijst-rie-iepr-poc-json-schema/browser'

for (const [section, filename, sheets] of [
  ['Kwaliteitsmeting', 'grondwater-kwaliteitsanalyses', ['Monsters', 'Meetresultaten']],
  ['Onttrekking/infiltratie', 'grondwater-debieten', ['Debieten']],
  ['Peilmeting', 'grondwater-peilmetingen', ['Peilmetingen']],
] as const) {
  test(`downloads the authoritative schema and matching blank ODS for ${section}`, async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('group', { name: 'Downloads voor deze doorsnede' })).toHaveCount(0)
    await page.locator('select#productie-jaar').selectOption('2026')
    await page.locator('select#thema').selectOption({ label: 'Grondwater' })
    await page.locator('select#doorsnede').selectOption({ label: section })
    const schemaDownload = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Generiek JSON-schema downloaden', exact: true }).click()
    const schemaFile = await schemaDownload
    expect(await schemaFile.failure()).toBeNull()
    expect(schemaFile.suggestedFilename()).toBe(`${filename}.schema.json`)
    const schemaPath = await schemaFile.path()
    if (!schemaPath) throw new Error('Missing downloaded schema.')
    const content = await readFile(schemaPath, 'utf8')
    const schema = JSON.parse(content)
    expect(schema.title).toBe(section)
    const index = await (await page.request.get('/schema/index.json')).json()
    const entry = index.files.find((entry: { id: string }) => entry.id === schema.$id)
    expect(entry.kind).toBe('section')
    expect(createHash('sha256').update(content).digest('hex')).toBe(entry.sha256)
    const personalDownload = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Persoonlijk JSON-schema downloaden', exact: true }).click()
    const personalFile = await personalDownload
    expect(await personalFile.failure()).toBeNull()
    expect(personalFile.suggestedFilename()).toBe(`${filename}.personalized.2026.schema.json`)
    const personalPath = await personalFile.path()
    if (!personalPath) throw new Error('Missing personalized schema.')
    const personalized: JsonSchemaObject = JSON.parse(await readFile(personalPath, 'utf8'))
    expect(personalized.$id).not.toBe(schema.$id)
    expect(personalized['x-reference-snapshot']).toMatchObject({
      genericSchemaId: schema.$id, referenceContext: { year: 2026 },
    })
    let referenceCount = 0
    const walk = (node: JsonSchemaObject) => {
      if (node.type === 'string' && node['x-reference-types']) {
        referenceCount++
        expect(node.enum?.length).toBeGreaterThan(0)
        const validator = new SchemaValidator()
        expect(validator.validateInstance(node, node.enum![0]).valid).toBe(true)
        expect(validator.validateInstance(node, 'urn:unknown:reference').valid).toBe(false)
      }
      for (const child of Object.values(node.properties ?? {})) walk(schemaObject(child))
      if (node.items) walk(schemaObject(node.items))
      for (const variant of Array.isArray(node.oneOf) ? node.oneOf : []) walk(schemaObject(variant))
    }
    walk(personalized)
    expect(referenceCount).toBeGreaterThan(0)
    const odsDownload = page.waitForEvent('download')
    await page.getByRole('link', { name: 'ODS-sjabloon downloaden', exact: true }).click()
    const odsFile = await odsDownload
    expect(await odsFile.failure()).toBeNull()
    expect(odsFile.suggestedFilename()).toBe(`${filename}.ods`)
    const odsPath = await odsFile.path()
    if (!odsPath) throw new Error('Missing downloaded workbook.')
    const tables = await readOdf(await readFile(odsPath))
    expect(tables.map(table => table.name)).toEqual(['Voorblad', ...sheets, 'Keuzelijsten', '_riepr'])
    const metadata = JSON.parse(tables.find(table => table.name === '_riepr')!.rows
      .slice(1).map(row => row.cells[0].text).join(''))
    expect(metadata.version).toBe(2)
    expect(metadata.schemaId).toBe(schema.$id)
    expect(metadata.schemaSha256).toBe(entry.sha256)
    expect(metadata.sourceSha256).toBe(index.sourceSha256)
    expect(Object.values(metadata.rows)).toEqual([
      expect.objectContaining({ recordId: 'root' }),
    ])
    for (const sheet of sheets) {
      const table = tables.find(table => table.name === sheet)!
      expect(table.rows.find(row => row.number === 1)!.cells[0].text).toMatch(/^\/[^ ]+\/\*$/)
      const headings = table.rows.find(row => row.number === 3)!
      expect(headings.cells.some(cell => cell.text.startsWith('Eenheid'))).toBe(true)
      expect(table.rows.find(row => row.number === 2)!.cells.every(cell => /^[/$]/.test(cell.text))).toBe(true)
    }
    if (section === 'Kwaliteitsmeting') {
      const variants = schema.properties.kwaliteitsmeting.items.properties.hasMember.items.oneOf
      const result = variants.find((variant: { properties: { observedProperty: { enum?: unknown[] } } }) =>
        variant.properties.observedProperty.enum)?.properties.hasResult
      expect(result.properties.measurementMethod['x-jsonld-id']).toBe('https://schema.org/measurementMethod')
      expect(result.properties.additionalProperty.items.oneOf[0].properties.value['x-jsonld-id']).toBe('https://schema.org/value')
      expect(result.properties).not.toHaveProperty('kwaliteitsmetingResultatenLimiet')
    }
  })
}

test('personalized download follows the selected year without replacing the generic download', async ({ page }) => {
  await page.goto('/')
  await page.locator('select#productie-jaar').selectOption('2024')
  await page.locator('select#thema').selectOption({ label: 'Grondwater' })
  await page.locator('select#doorsnede').selectOption({ label: 'Peilmeting' })
  const generic = await page.getByRole('link', { name: 'Generiek JSON-schema downloaden', exact: true }).getAttribute('href')
  const first = await page.getByRole('link', { name: 'Persoonlijk JSON-schema downloaden', exact: true }).getAttribute('href')
  await page.locator('select#productie-jaar').selectOption('2025')
  const second = await page.getByRole('link', { name: 'Persoonlijk JSON-schema downloaden', exact: true }).getAttribute('href')
  expect(second).not.toBe(first)
  expect(await page.getByRole('link', { name: 'Generiek JSON-schema downloaden', exact: true }).getAttribute('href')).toBe(generic)
  const download = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Persoonlijk JSON-schema downloaden', exact: true }).click()
  const file = await download
  const path = await file.path()
  if (!path) throw new Error('Missing personalized schema.')
  const schema = JSON.parse(await readFile(path, 'utf8'))
  expect(schema['x-reference-snapshot'].referenceContext.year).toBe(2025)
  expect(schema['x-reference-snapshot'].references.every((reference: { year: number }) => reference.year === 2025)).toBe(true)
})
