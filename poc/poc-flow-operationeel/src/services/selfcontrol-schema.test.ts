// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { schemaObject } from 'codelijst-rie-iepr-poc-json-schema/browser'
import { sourceSnapshot } from '../../../poc-json-schema/scripts/source-snapshot.mjs'
import { compileTheme } from '../../../poc-json-schema/tests/groundwater-csv-fixture.js'
import { SchemaEditor } from './schema-editor.js'

const load = (name: string) => JSON.parse(readFileSync(new URL(`../../../poc-json-schema/examples/${name}.json`, import.meta.url), 'utf8'))

for (const [theme, slug] of [['Zelfcontrole lucht', 'zelfcontrole-lucht'], ['Zelfcontrole water', 'zelfcontrole-water']]) {
  const schema = compileTheme(JSON.parse(sourceSnapshot()), theme).subSchemas[0].schema
  describe(`${theme} schema-driven projection`, () => {
    it('preserves canonical result ownership, selected units, zero values and optional absence', () => {
      const editor = new SchemaEditor(schema, [], load('refs'), { year: 2024 })
      const data = load(`${slug}/meting`)
      editor.load(data)
      expect(editor.validate()).toEqual({ data, diagnostics: [] })
      const measurement = schemaObject(schemaObject(editor.inputSchema.properties!.meting).items)
      const parameter = schemaObject(schemaObject(measurement.properties!.hasMember).items)
      const columns = editor.columns(parameter)
      expect(columns.some(column => /propertyID|observedProperty/.test(column.title))).toBe(false)
      const loq = columns.findIndex(column => column.title === 'Bepalingsgrens (LOQ)')
      const concentration = columns.findIndex(column => column.title.startsWith('Concentratie'))
      expect(loq).toBeGreaterThanOrEqual(0)
      expect(loq).toBeLessThan(concentration)
      expect(data.meting[0].hasMember[1].hasResult.additionalProperty).toContainEqual({
        propertyID: `https://data.omgeving.vlaanderen.be/id/concept/riepr/operationeel-${slug}/parameter-loq`,
        value: 'https://data.omgeving.vlaanderen.be/id/concept/riepr/operationeel-grondwater/detectiegrens-onder',
      })
      const uncertainty = columns.find(column => column.title === 'Meetonzekerheid')!
      editor.set(['meting', 0, 'hasMember', 0, ...uncertainty.path], 0.5)
      expect(editor.validate().diagnostics).not.toEqual([])
    })
  })
}
