// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sourceSnapshot } from '../../../poc-json-schema/scripts/source-snapshot.mjs'
import { compileTheme } from '../../../poc-json-schema/tests/groundwater-csv-fixture.js'
import { SchemaEditor } from './schema-editor.js'

const load = (name: string) => JSON.parse(readFileSync(new URL(`../../../poc-json-schema/examples/${name}.json`, import.meta.url), 'utf8'))
const compiled = compileTheme(JSON.parse(sourceSnapshot()), 'Grondstoffen')

describe('Schema-driven raw-material editing', () => {
  it.each(['grondstof', 'inkomend'])('preserves %s canonical ownership, zero values and optional absence', name => {
    const schema = compiled.subSchemas.find(section => section.name === name)!.schema
    const editor = new SchemaEditor(schema, [], load('refs'), { year: 2024 })
    const data = load(`grondstoffen/${name}`)
    editor.load(data)
    expect(editor.validate()).toEqual({ data, diagnostics: [] })
    if (name === 'grondstof') {
      editor.set(['grondstof', 0, 'qualifiedAssociation', 0, 'type'],
        'https://data.omgeving.vlaanderen.be/id/concept/riepr/operationeel-bestemmingstype/particulier')
      const changed = editor.validate()
      expect(changed.diagnostics).toEqual([])
      const expected = load('grondstoffen/grondstof')
      expected.grondstof[0].qualifiedAssociation[0] = {
        type: 'https://data.omgeving.vlaanderen.be/id/concept/riepr/operationeel-bestemmingstype/particulier',
      }
      expect(changed.data).toEqual(expected)
    } else {
      editor.set(['inkomend', 0, 'hasResult', 'numericValue'], -1)
      expect(editor.validate().diagnostics.length).toBeGreaterThan(0)
    }
  })
})
