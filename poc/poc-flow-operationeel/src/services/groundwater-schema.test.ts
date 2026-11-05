// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { schemaObject } from 'codelijst-rie-iepr-poc-json-schema/browser'
import { compileGroundwater } from '../../../poc-json-schema/tests/groundwater-csv-fixture.js'
import { sourceSnapshot } from '../../../poc-json-schema/scripts/source-snapshot.mjs'
import { SchemaEditor } from './schema-editor.js'

describe('Groundwater schema-driven table projection', () => {
  it.each(['onttrekking', 'peilmeting', 'kwaliteitsmeting'])('projects and validates the real %s schema without changing the persistent example', name => {
    const schema = compileGroundwater(JSON.parse(sourceSnapshot())).subSchemas.find(section => section.name === name)!.schema
    const data = JSON.parse(readFileSync(new URL(`../../../poc-json-schema/examples/grondwater/${name}.json`, import.meta.url), 'utf8'))
    const references = JSON.parse(readFileSync(new URL('../../../poc-json-schema/examples/refs.json', import.meta.url), 'utf8'))
    const editor = new SchemaEditor(schema, [], references, { year: 2024 })
    editor.load(data)
    expect(editor.validate()).toEqual({ data, diagnostics: [] })
    const record = schemaObject(schemaObject(editor.inputSchema.properties![name]).items)
    const columns = editor.columns(record)
    expect(columns.some(column => column.path.at(-1) === '@id')).toBe(false)
    if (name === 'onttrekking') expect(columns.filter(column => column.title === 'Einddatum')).toHaveLength(1)
    if (name === 'kwaliteitsmeting') {
      expect(columns.find(column => column.path.join('/') === 'wasAssociatedWith/label')?.title).toBe('Labo naam')
      expect(columns.map(column => column.title)).not.toContain('Labo')
    }
    for (const [index, column] of columns.entries()) {
      if (!['hasUnit', 'unitCode'].includes(column.path.at(-1) ?? '')) continue
      expect(columns[index - 1].path.slice(0, -1)).toEqual(column.path.slice(0, -1))
      expect(column.title).toBe('Eenheid')
    }
  })

  it('only asks the lab name, while keeping its typed Agent object in the JSON', () => {
    const schema = compileGroundwater().subSchemas[2].schema
    const editor = new SchemaEditor(schema)
    editor.add(['kwaliteitsmeting'], editor.schemaAt(['kwaliteitsmeting']))
    const record = schemaObject(schemaObject(schema.properties!.kwaliteitsmeting).items)
    const columns = editor.columns(record)
    expect(columns.find(column => column.path.join('/') === 'wasAssociatedWith/label')?.title).toBe('Labo naam')
    expect(columns.map(column => column.title)).not.toContain('Labo')
    expect(columns.some(column => column.path.at(-1) === '@id')).toBe(false)
    editor.set(['kwaliteitsmeting', 0, 'wasAssociatedWith', 'label'], 'Synthetisch laboratorium')
    expect(editor.project()).toEqual({ kwaliteitsmeting: [{ wasAssociatedWith: { label: 'Synthetisch laboratorium' } }] })
    expect(schemaObject(record.properties!.wasAssociatedWith)['x-jsonld-type']).toBe('http://www.w3.org/ns/prov#Agent')
  })

  it('shows Einddatum once, shares its value, and does not create an unreported end reading', () => {
    const schema = compileGroundwater().subSchemas[0].schema
    const editor = new SchemaEditor(schema)
    editor.add(['onttrekking'], editor.schemaAt(['onttrekking']))
    const record = schemaObject(schemaObject(editor.inputSchema.properties!.onttrekking).items)
    expect(editor.columns(record).filter(column => column.title === 'Einddatum')).toHaveLength(1)
    editor.set(['onttrekking', 0, 'hoeveelheid', 'resultTime'], '2024-12-31')
    editor.set(['onttrekking', 0, 'hoeveelheid', 'hasResult', 'numericValue'], 0)
    const first = editor.validate()
    expect(first.diagnostics).toEqual([])
    expect(first.data).toMatchObject({ onttrekking: [{ hasMember: [{ resultTime: '2024-12-31', hasResult: { numericValue: 0 } }] }] })
    expect(first.data.onttrekking).not.toMatchObject([{ eindmeterstand: expect.anything() }])
    editor.set(['onttrekking', 0, 'eindmeterstand', 'hasResult', 'numericValue'], 150)
    expect(editor.validate()).toMatchObject({
      diagnostics: [],
      data: { onttrekking: [{ hasMember: [
        { resultTime: '2024-12-31', hasResult: { numericValue: 150 } },
        { resultTime: '2024-12-31', hasResult: { numericValue: 0 } },
      ] }] },
    })
  })

  it('preserves selectable unit URIs and rejects an unknown unit', () => {
    const schema = compileGroundwater().subSchemas[2].schema
    const editor = new SchemaEditor(schema)
    editor.set(['kwaliteitsmeting'], [{
      hasMember: [{ observedProperty: 'https://example.test/parameters/a',
        hasResult: { numericValue: 0, hasUnit: 'https://example.test/units/mgL' } }],
    }])
    expect(editor.validate().diagnostics).toEqual([])
    editor.set(['kwaliteitsmeting', 0, 'hasMember', 0, 'hasResult', 'hasUnit'], 'urn:unknown:unit')
    expect(editor.validate().diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ instancePath: '/kwaliteitsmeting/0/hasMember/0/hasResult/hasUnit' }),
    ]))
  })
})
