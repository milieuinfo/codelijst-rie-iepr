import { describe, expect, it } from 'vitest'
import { sourceSnapshot } from '../scripts/source-snapshot.mjs'
import { CodelistParser } from '../src/services/codelist-parser.js'
import { ThemeResolver } from '../src/services/theme-resolver.js'
import { SchemaValidator } from '../src/services/schema-validator.js'
import { materializeDerivedValues } from '../src/services/derived-values.js'
import { schemaObject } from '../src/services/schema-registry.js'
import { compileGroundwater, groundwaterFixture } from './groundwater-csv-fixture.js'
import { memberVariants, presentationSchema, transformMemberData } from '../src/services/member-layout.js'

describe('Groundwater CSV reporting profile', () => {
  it('parses active reports with supporting choices, without thematypes', () => {
    const result = new CodelistParser().parseData(JSON.parse(sourceSnapshot()))
    expect([...new ThemeResolver().resolveAllThemes(result).keys()]).toEqual(['Grondwater', 'Lucht', 'Water'])
    expect(result.schemes.has('conceptscheme:operationeel_lucht')).toBe(true)
    expect(result.concepts.has('lucht:emissie')).toBe(true)
    expect(result.schemes.has('conceptscheme:thematypes')).toBe(false)
    expect(result.collections.get('collectie:operationeel_parameters_grondwater')).toHaveLength(6)
    const feature = result.concepts.get('grondwater:onttrekking-feature')!
    expect(feature.tableSheet).toBe('Debieten')
    expect(feature.relevantFeatureClass).toEqual(['riepr:Onttrekking'])
  })

  it('produces three schemas with declared workbook and worksheet names', () => {
    const sections = compileGroundwater().subSchemas
    expect(sections.map(section => section.schema['x-table-workbook'])).toEqual([
      'grondwater-debieten.ods', 'grondwater-peilmetingen.ods', 'grondwater-kwaliteitsanalyses.ods',
    ])
    const record = schemaObject(schemaObject(presentationSchema(sections[0].schema).properties!.onttrekking).items)
    expect(record['x-table-sheet']).toBe('Debieten')
    const observation = schemaObject(record.properties!.startmeterstand)
    expect(schemaObject(observation.properties!.resultTime).title).toBe('Startdatum')
    expect(schemaObject(observation.properties!.hasResult)['x-jsonld-type']).toContain('Resultaat')
    expect(schemaObject(observation.properties!.hasResult)['x-jsonld-id']).toBe('http://www.w3.org/ns/sosa/hasResult')
  })

  it('moves non-SOSA values into the implicit Resultaat and keeps supporting entities intact', () => {
    const sections = compileGroundwater().subSchemas
    const level = schemaObject(schemaObject(sections[1].schema.properties!.peilmeting).items)
    expect(level.properties).not.toHaveProperty('numericValue')
    const result = schemaObject(level.properties!.hasResult)
    expect(schemaObject(result.properties!.numericValue).title).toBe('Diepte')
    expect(schemaObject(result.properties!.measurementMethod).title).toBe('Peilmethode')
    const quality = schemaObject(schemaObject(sections[2].schema.properties!.kwaliteitsmeting).items)
    expect(JSON.stringify(quality)).not.toContain('http://www.w3.org/ns/sosa/Sample')
    const filters = schemaObject(schemaObject(quality.properties!.hasFeatureOfInterest).items)
    expect(filters['x-feature-mapping']).toMatchObject({
      relation: 'http://www.w3.org/ns/sosa/hasFeatureOfInterest',
      classes: ['https://data.riepr.omgeving.vlaanderen.be/ns/riepr#Emissie'],
    })
    expect(filters['x-jsonld-id']).toBeUndefined()
    const agent = schemaObject(quality.properties!.wasAssociatedWith)
    expect(agent['x-jsonld-type']).toBe('http://www.w3.org/ns/prov#Agent')
    expect(schemaObject(agent.properties!.label).title).toBe('Labo naam')
    const member = memberVariants(quality)[0]
    expect(member.properties).toHaveProperty('observedProperty')
    expect(schemaObject(schemaObject(member.properties!.hasResult).properties!.hasUnit).enum).toEqual([
      'https://example.test/units/mgL', 'https://example.test/units/gL',
    ])
  })

  it('copies a shared result time per record without crossing records or accepting conflicts', () => {
    const schema = compileGroundwater().subSchemas[0].schema
    const record = schemaObject(schemaObject(presentationSchema(schema).properties!.onttrekking).items)
    const value = (name: string, numericValue: number, resultTime?: string) => {
      const observation = schemaObject(record.properties![name])
      return {
        observedProperty: schemaObject(observation.properties!.observedProperty).const,
        hasResult: { numericValue, hasUnit: 'https://example.test/units/m3' },
        ...(resultTime ? { resultTime } : {}),
      }
    }
    const data = { onttrekking: ['2024-12-30', '2024-12-31'].map(date => ({
      eindmeterstand: value('eindmeterstand', 150), hoeveelheid: value('hoeveelheid', 0, date),
    })) }
    const canonical = materializeDerivedValues(schema, transformMemberData(schema, data, 'canonical'))
    const output = transformMemberData(schema, canonical, 'presentation') as typeof data
    expect(output.onttrekking.map(row => row.eindmeterstand.resultTime)).toEqual(['2024-12-30', '2024-12-31'])
    expect(data.onttrekking[0].eindmeterstand.resultTime).toBeUndefined()
    expect(new SchemaValidator().validateInstance(schema, canonical).errors).toEqual([])
    output.onttrekking[0].eindmeterstand.resultTime = '2024-01-01'
    expect(() => materializeDerivedValues(schema, transformMemberData(schema, output, 'canonical'))).toThrow('Conflicting derived value')
  })

  it('rejects stale source references rather than guessing replacements', () => {
    const data = groundwaterFixture()
    data.graph.push({
      id: 'grondwater:broken', _type: 'skos:Concept', inScheme: 'conceptscheme:operationeel_grondwater',
      prefLabel: 'Broken', broaderPartitive: 'grondwater:peilmeting', relevantDataType: 'xsd:string',
      conditionPath: 'grondwater:missing',
    })
    expect(() => compileGroundwater(data)).toThrow('conditionPath refers to missing concept')
  })

  it('rejects non-observation ownership and ambiguous transfers into unrelated repeated records', () => {
    for (const [target, message] of [
      ['grondwater:limiet', 'not an observation or collection'],
      ['grondwater:peilmeting', 'crosses repeated record boundaries'],
    ]) {
      const data = groundwaterFixture()
      Object.assign(data.graph.find(node => node.id === 'grondwater:startdatum')!, { relevantObservation: target })
      expect(() => compileGroundwater(data)).toThrow(message)
    }
    const data = groundwaterFixture()
    data.graph.push({
      id: 'grondwater:shared-date', _type: 'skos:Concept', inScheme: 'conceptscheme:operationeel_grondwater',
      prefLabel: 'Shared date', broaderPartitive: 'grondwater:kwaliteitsmeting',
      relevantDataType: 'xsd:dateTime', relation: 'sosa:resultTime', relevantObservation: 'grondwater:resultaten',
    })
    expect(() => compileGroundwater(data)).toThrow('crosses repeated record boundaries')
  })
})
