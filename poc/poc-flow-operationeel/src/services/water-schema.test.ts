// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { schemaObject } from 'codelijst-rie-iepr-poc-json-schema/browser'
import { sourceSnapshot } from '../../../poc-json-schema/scripts/source-snapshot.mjs'
import { compileTheme } from '../../../poc-json-schema/tests/groundwater-csv-fixture.js'
import { SchemaEditor } from './schema-editor.js'

const load = (name: string) => JSON.parse(readFileSync(new URL(`../../../poc-json-schema/examples/${name}.json`, import.meta.url), 'utf8'))
const editorFor = (name: string) => {
  const schema = compileTheme(JSON.parse(sourceSnapshot()), 'Water').subSchemas.find(section => section.name === name)!.schema
  return new SchemaEditor(schema, [], load('refs'), { year: 2024 })
}

describe('Water schema-driven table projection', () => {
  it.each(['lozing', 'abnormale-lozing', 'watergebruik'])('preserves %s values and optional absence in validated JSON', name => {
    const editor = editorFor(name)
    const data = load(`water/${name}`)
    editor.load(data)
    expect(editor.validate()).toEqual({ data, diagnostics: [] })
  })

  it('projects water-use installation, origin and volume as a single record', () => {
    const editor = editorFor('watergebruik')
    const record = schemaObject(schemaObject(editor.inputSchema.properties!.watergebruik).items)
    const columns = editor.columns(record)
    expect(columns.map(column => column.title)).toEqual(['Installatie', 'Herkomst', 'Onttrokken hoeveelheid', 'Eenheid'])
    const volume = columns.find(column => column.title === 'Onttrokken hoeveelheid')!
    expect(volume.schema.type).toBe('number')
    expect(volume.schema.minimum).toBe(0)
    editor.load(load('water/watergebruik'))
    editor.set(['watergebruik', 0, ...volume.path], -0.5)
    expect(editor.validate().diagnostics).not.toEqual([])
  })

  it('shows numeric frequency and nested pollutant results, hiding class and property discriminators', () => {
    const editor = editorFor('lozing')
    const parent = schemaObject(schemaObject(editor.inputSchema.properties!.lozing).items)
    expect(editor.columns(parent).map(column => column.title)).toEqual([
      'Controleinrichting', 'Jaardebiet', 'Eenheid', 'Aantal dagen per jaar', 'Eenheid', 'Stoffen in waterstromen',
    ])
    const child = schemaObject(schemaObject(parent.properties!.lozingParameter).items)
    const columns = editor.columns(child)
    expect(columns.map(column => column.title)).toEqual([
      'Verontreinigende stof', 'Meetfrequentie', 'Gemiddelde concentratie', 'Eenheid',
      'Totale jaarvracht', 'Eenheid', 'Bepalingsmethode', 'Bepalingsmethodeclassificatie',
    ])
    const frequency = columns.find(column => column.title === 'Meetfrequentie')!
    expect(frequency.schema.type).toBe('integer')
    expect(frequency.schema.minimum).toBe(0)
    expect(frequency.schema.enum).toBeUndefined()
    editor.load(load('water/lozing'))
    editor.set(['lozing', 0, 'lozingParameter', 0, ...frequency.path], -1)
    expect(editor.validate().diagnostics).not.toEqual([])
  })
})
