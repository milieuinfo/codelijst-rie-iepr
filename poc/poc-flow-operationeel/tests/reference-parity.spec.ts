import { test, expect } from '@playwright/test'
import { readOdf } from '../../poc-json-schema-ods/src/services/odf.js'
import { schemaObject, type JsonSchemaObject, referenceSnapshot } from 'codelijst-rie-iepr-poc-json-schema/browser'

for (const [theme, section] of [
  ['Grondwater', 'Kwaliteitsmeting'],
  ['Grondwater', 'Onttrekking/infiltratie'],
  ['Grondwater', 'Peilmeting'],
  ['Lucht', 'Emissie'],
  ['Lucht', 'Verbruikte brandstof'],
  ['Lucht', 'Verbruikte stof'],
  ['Lucht', 'Geproduceerde stof'],
  ['Lucht', 'Afvalproduct'],
  ['Water', 'Lozing'],
  ['Zelfcontrole lucht', 'Metingen'],
  ['Zelfcontrole water', 'Metingen'],
]) {
  test(`shares reference identities and labels between UI and downloaded ODS: ${theme} / ${section}`, async ({ page }) => {
    await page.goto('/')
    await page.locator('select#productie-jaar').selectOption('2026')
    await page.locator('select#thema').selectOption({ label: theme })
    await page.getByLabel('Rapporteringsonderdeel', { exact: true }).selectOption({ label: section })
    const personalUrl = await page.getByRole('link', { name: 'Persoonlijk JSON-schema downloaden', exact: true }).getAttribute('href')
    const personalized: JsonSchemaObject = await page.evaluate(async url => (await fetch(url)).json(), personalUrl!)
    const snapshot = referenceSnapshot(personalized)!
    const templateUrl = await page.getByRole('link', { name: 'ODS-sjabloon downloaden', exact: true }).getAttribute('href')
    const tables = await readOdf(new Uint8Array(await (await page.request.get(templateUrl!)).body()))
    const lookups = tables.find(table => table.name === 'Keuzelijsten')!.rows.slice(2)
    let checked = 0
    const walk = (node: JsonSchemaObject) => {
      if (node.type === 'string' && Array.isArray(node['x-reference-types'])) {
        const expected = node.enum!.map(id => ({
          id, label: snapshot.references.find(reference => reference.id === id)!.label,
        }))
        const fields = new Set(lookups.filter(row => expected.some(choice => choice.id === row.cells[3].text))
          .map(row => row.cells[0].text))
        expect(fields.size).toBeGreaterThan(0)
        for (const field of fields) {
          expect(lookups.filter(row => row.cells[0].text === field)
            .map(row => ({ id: row.cells[3].text, label: row.cells[2].text }))
            .sort((a, b) => a.id.localeCompare(b.id))).toEqual(expected)
        }
        checked++
      }
      for (const child of Object.values(node.properties ?? {})) walk(schemaObject(child))
      if (node.items) walk(schemaObject(node.items))
      for (const variant of Array.isArray(node.oneOf) ? node.oneOf : []) walk(schemaObject(variant))
    }
    walk(personalized)
    expect(checked).toBeGreaterThan(0)
    expect(snapshot.references.every(reference => reference.year === 2026)).toBe(true)
    if (theme === 'Lucht') expect(snapshot.references.some(reference => reference.label === 'GLASOVEN')).toBe(true)
  })
}
