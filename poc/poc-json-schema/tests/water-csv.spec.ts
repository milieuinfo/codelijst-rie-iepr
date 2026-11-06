import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sourceSnapshot } from '../scripts/source-snapshot.mjs'
import { compileTheme } from './groundwater-csv-fixture.js'
import { SchemaValidator } from '../src/services/schema-validator.js'
import { SemanticValidator } from '../src/services/semantic-validator.js'
import { presentationSchema, transformMemberData } from '../src/services/member-layout.js'
import { schemaObject } from '../src/services/schema-registry.js'

const compileWater = () => compileTheme(JSON.parse(sourceSnapshot()), 'Water')
const section = (name: string) => compileWater().subSchemas.find(section => section.name === name)!.schema
const load = (name: string) => JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'))
const base = 'https://data.omgeving.vlaanderen.be/id/concept/riepr/operationeel-water/'

describe('Current water CSV reporting contract', () => {
  it.each(['lozing', 'abnormale-lozing'])('validates the persistent %s example and preserves its presentation round trip', name => {
    const schema = section(name)
    const data = load(`water/${name}`)
    expect(new SchemaValidator().validateInstance(schema, data).errors).toEqual([])
    expect(new SemanticValidator().validate(schema, data, {
      references: load('refs'), referenceContext: load('reference-context'),
    })).toEqual([])
    const input = transformMemberData(schema, data, 'presentation')
    expect(transformMemberData(schema, input, 'canonical')).toEqual(data)
  })

  it('owns flow and days on the control-point record, with pollutant-specific results and procedures', () => {
    const schema = section('lozing')
    expect(compileWater().subSchemas.map(section => section.name)).toEqual(['lozing', 'abnormale-lozing'])
    expect(schema['x-table-workbook']).toBe('water-lozingen.ods')
    const record = schemaObject(schemaObject(presentationSchema(schema).properties!.lozing).items)
    expect(record['x-table-sheet']).toBe('Waterstromen')
    expect(record['x-table-key']).toEqual([base + 'feature'])
    expect(record.required).toEqual(['hasFeatureOfInterest', 'lozingDebiet', 'lozingDagen', 'lozingParameter'])
    const parameter = schemaObject(schemaObject(record.properties!.lozingParameter).items)
    expect(parameter['x-table-sheet']).toBe('Stoffen in waterstromen')
    expect(parameter.properties).not.toHaveProperty('observedProperty')
    expect(parameter.properties).not.toHaveProperty('lozingDebiet')
    expect(record.properties).not.toHaveProperty('usedProcedure')
    expect(parameter.properties).toHaveProperty('usedProcedure')
    expect(JSON.stringify(schema)).not.toContain('"@id":')
  })

  it('requires a pollutant and a result per detail record, without requiring both result kinds', () => {
    const schema = section('lozing')
    const data = load('water/lozing')
    for (const change of ['pollutant', 'results', 'detail', 'flow']) {
      const invalid = structuredClone(data)
      const parameter = invalid.lozing[0].hasMember[2]
      if (change === 'pollutant') parameter.additionalProperty.shift()
      if (change === 'results') parameter.hasMember = []
      if (change === 'detail') invalid.lozing[0].hasMember.splice(2)
      if (change === 'flow') invalid.lozing[0].hasMember.shift()
      expect(new SchemaValidator().validateInstance(schema, invalid).valid).toBe(false)
    }
  })

  it('accepts zero and absence for frequency, but rejects negative and fractional measurement counts', () => {
    const schema = section('lozing')
    for (const value of [-1, 1.5]) {
      const data = load('water/lozing')
      data.lozing[0].hasMember[2].additionalProperty[1].value = value
      expect(new SchemaValidator().validateInstance(schema, data).valid).toBe(false)
    }
  })
})
