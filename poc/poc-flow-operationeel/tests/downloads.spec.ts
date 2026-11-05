import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { readOdf } from '../../poc-json-schema-ods/src/services/odf.js'

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
    await page.getByRole('link', { name: 'JSON-schema downloaden', exact: true }).click()
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
      expect(table.rows.find(row => row.number === 2)!.cells.every(cell => cell.text.startsWith('/'))).toBe(true)
    }
    if (section === 'Kwaliteitsmeting') {
      const result = schema.properties.kwaliteitsmeting.items.properties.hasMember.items.properties.hasResult
      expect(result.properties.measurementMethod['x-jsonld-id']).toBe('https://schema.org/measurementMethod')
      expect(result.properties.additionalProperty.properties.value['x-jsonld-id']).toBe('https://schema.org/value')
      expect(result.properties).not.toHaveProperty('kwaliteitsmetingResultatenLimiet')
    }
  })
}
