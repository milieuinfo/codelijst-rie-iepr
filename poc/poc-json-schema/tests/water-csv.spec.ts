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
  it.each(['lozing', 'abnormale-lozing', 'watergebruik'])('validates the persistent %s example and preserves its presentation round trip', name => {
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
    expect(compileWater().subSchemas.map(section => section.name)).toEqual(['lozing', 'abnormale-lozing', 'watergebruik'])
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

  it('accepts zero but rejects negative annual volumes, days, concentrations and loads', () => {
    const schema = section('lozing')
    const validator = new SchemaValidator()
    for (const index of [0, 1, 2, 3]) {
      for (const value of [0, -0.5]) {
        const data = load('water/lozing')
        const members = data.lozing[0].hasMember
        const results = [members[0].hasResult, members[1].hasResult,
          members[2].hasMember[0].hasResult, members[2].hasMember[1].hasResult]
        results[index].numericValue = value
        expect(validator.validateInstance(schema, data).valid, `result ${index}: ${value}`).toBe(value === 0)
      }
    }
  })

  it('validates abnormal discharge as a non-negative integer day count and a non-negative kg load', () => {
    const schema = section('abnormale-lozing')
    const validator = new SchemaValidator()
    for (const value of [-1, 0.5]) {
      const data = load('water/abnormale-lozing')
      data.abnormaleLozing[0].hasResult.additionalProperty[1].value = value
      expect(validator.validateInstance(schema, data).valid).toBe(false)
    }
    const data = load('water/abnormale-lozing')
    data.abnormaleLozing[0].hasResult.numericValue = -0.5
    expect(validator.validateInstance(schema, data).valid).toBe(false)
  })

  it('requires an installation process, agreed origin and non-negative decimal volume without allocation', () => {
    const schema = section('watergebruik')
    const validator = new SchemaValidator()
    expect(schema['x-table-workbook']).toBe('water-watergebruik.ods')
    expect(validator.validateInstance(schema, {}).valid).toBe(true)
    for (const change of ['negative', 'origin', 'missing-origin', 'missing-volume', 'missing-process']) {
      const data = load('water/watergebruik')
      const result = data.watergebruik[0].hasResult
      if (change === 'negative') result.numericValue = -0.5
      if (change === 'origin') result.additionalProperty[0].value = base + 'unknown-origin'
      if (change === 'missing-origin') result.additionalProperty = []
      if (change === 'missing-volume') delete result.numericValue
      if (change === 'missing-process') delete data.watergebruik[0].hasFeatureOfInterest
      expect(validator.validateInstance(schema, data).valid, change).toBe(false)
    }
    for (const origin of ['grondwater', 'hemelwater', 'oppervlaktewater',
      'openbare-distributie-drinkwater', 'openbare-distributie-industriewater', 'andere']) {
      const data = load('water/watergebruik')
      data.watergebruik[0].hasResult.additionalProperty[0].value = base + 'herkomst-' + origin
      expect(validator.validateInstance(schema, data).errors).toEqual([])
    }
  })
})
