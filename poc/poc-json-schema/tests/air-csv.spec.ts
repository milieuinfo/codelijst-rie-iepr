import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sourceSnapshot } from '../scripts/source-snapshot.mjs'
import { CodelistParser } from '../src/services/codelist-parser.js'
import { ThemeResolver } from '../src/services/theme-resolver.js'
import { SchemaValidator } from '../src/services/schema-validator.js'
import { SemanticValidator } from '../src/services/semantic-validator.js'
import { presentationSchema } from '../src/services/member-layout.js'
import { schemaObject } from '../src/services/schema-registry.js'
import { compileTheme } from './groundwater-csv-fixture.js'
import { reportingRecords } from '../src/services/record-key.js'

const compileAir = () => compileTheme(JSON.parse(sourceSnapshot()), 'Lucht')
const section = (name: string) => compileAir().subSchemas.find(section => section.name === name)!.schema
const load = (name: string) => JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'))
const units = ['E_89', 'E_41', 'E_33', 'E_59', 'E_95', 'E_32', 'E_83']
  .map(code => `https://data.omgeving.vlaanderen.be/id/concept/csor/eenheid/${code}`)

describe('Current air CSV reporting entry', () => {
  it('generates separate emissions and four installation-wide material sections', () => {
    const { domainSchema, subSchemas } = compileAir()
    expect(subSchemas.map(section => section.name).sort()).toEqual([
      'afvalproduct', 'brandstof', 'emissie', 'geproduceerde-stof', 'verbruikte-stof',
    ])
    expect(domainSchema['x-theme-slug']).toBe('lucht')
    const schema = section('emissie')
    expect(schema['x-table-workbook']).toBe('lucht-emissies.ods')
    const record = schemaObject(schemaObject(schema.properties!.emissie).items)
    expect(record['x-table-sheet']).toBe('Emissiegehelen')
    expect(record['x-table-key']).toEqual(['feature_ep', 'feature_bron'].map(name =>
      `https://data.omgeving.vlaanderen.be/id/concept/riepr/operationeel-lucht/${name}`))
    expect(JSON.stringify(domainSchema)).not.toContain('"@id":')
    const input = schemaObject(schemaObject(presentationSchema(schema).properties!.emissie).items)
    expect(input.required).toEqual(['featureEp', 'featureBron'])
    expect(schemaObject(input.properties!.featureEp)['x-ui-first']).toBe(true)
    expect(schemaObject(input.properties!.featureBron)['x-ui-after']).toBe('featureEp')
    expect(schemaObject(input.properties!.type)['x-ui-after']).toBe('used')
    expect(schemaObject(input.properties!.used)['x-ui-after']).toBe('featureBron')
    expect(input.properties).not.toHaveProperty('brandstof')
  })

  it.each(['emissie', 'brandstof', 'verbruikte_stof', 'geproduceerde_stof', 'afvalproduct'])(
    'validates the persistent %s example structurally and semantically', name => {
    const schema = section(name.replaceAll('_', '-'))
    const data = load(`lucht/${name}`)
    expect(new SchemaValidator().validateInstance(schema, data).errors).toEqual([])
    expect(new SemanticValidator().validate(schema, data, {
      references: load('refs'), referenceContext: load('reference-context'),
    })).toEqual([])
  })

  it.each([
    ['verbruikte-stof', 'verbruikteStof'],
    ['geproduceerde-stof', 'geproduceerdeStof'],
    ['afvalproduct', 'afvalproduct'],
  ])('expands exactly the seven approved units in %s and requires an installation', (name, key) => {
    const schema = section(name)
    const record = schemaObject(schemaObject(schema.properties![key]).items)
    const result = schemaObject(record.properties!.hasResult)
    expect(schemaObject(result.properties!.hasUnit).enum).toEqual(expect.arrayContaining(units))
    expect(schemaObject(result.properties!.hasUnit).enum).toHaveLength(7)
    for (const hasUnit of units) {
      const value = load(`lucht/${name.replaceAll('-', '_')}`)
      value[key][0].hasResult.hasUnit = hasUnit
      expect(new SchemaValidator().validateInstance(schema, value).errors).toEqual([])
    }
    const missing = load(`lucht/${name.replaceAll('-', '_')}`)
    delete missing[key][0].hasFeatureOfInterest
    expect(new SchemaValidator().validateInstance(schema, missing).valid).toBe(false)
  })

  it('allows omitted fuel percentages and enforces the inclusive 0–100 bounds', () => {
    const schema = section('brandstof')
    for (const numericValue of [-0.01, 100.01]) {
      const data = load('lucht/brandstof')
      data.brandstof[1].hasMember[0].hasResult.numericValue = numericValue
      expect(new SchemaValidator().validateInstance(schema, data).valid).toBe(false)
    }
    const record = schemaObject(schemaObject(schema.properties!.brandstof).items)
    expect(record['x-relevant-feature-classes']).toBeUndefined()
    expect(schemaObject(record.properties!.hasFeatureOfInterest)['x-jsonld-id'])
      .toBe('http://www.w3.org/ns/sosa/hasFeatureOfInterest')
  })

  it('resolves material selections by the declared key, installation relationship and reporting year', () => {
    const schema = section('brandstof')
    const data = load('lucht/brandstof')
    const records = reportingRecords([{ schema, data, year: 2024 }], load('refs'))
    const selected = records[0].reference
    expect(selected.label).toContain('Aardgas')
    expect(selected.relations).toEqual({ 'http://www.w3.org/ns/sosa/hasFeatureOfInterest': [data.brandstof[0].hasFeatureOfInterest] })
    expect(reportingRecords([{ schema, data, year: 2025 }])[0].reference.id).not.toBe(selected.id)
    const changed = structuredClone(data)
    changed.brandstof[0].label = 'Andere brandstof'
    expect(reportingRecords([{ schema, data: changed, year: 2024 }])[0].reference.id).not.toBe(selected.id)
    const emission = load('lucht/emissie')
    emission.emissie[0].used = [selected.id]
    const validate = () => new SemanticValidator().validate(section('emissie'), emission, {
      references: [...load('refs'), ...records.map(record => record.reference)], referenceContext: { year: 2024 },
    })
    expect(validate()).toEqual([])
    emission.emissie[0].featureBron = ['urn:demo:process:urn%3Ademo%3Ainstallatie%3A1']
    expect(validate()).toEqual(expect.arrayContaining([expect.objectContaining({ keyword: 'reference' })]))
  })

  it.each(['brandstof', 'verbruikte_stof', 'geproduceerde_stof', 'afvalproduct'])(
    'rejects duplicate installation/name keys in %s without introducing an ID input', name => {
      const schema = section(name.replaceAll('_', '-'))
      const data = load(`lucht/${name}`)
      const key = name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
      data[key].push(structuredClone(data[key][0]))
      expect(new SemanticValidator().validate(schema, data, { references: load('refs') }))
        .toEqual(expect.arrayContaining([expect.objectContaining({ keyword: 'identity', message: expect.stringContaining('Duplicate') })]))
      expect(() => reportingRecords([{ schema, data, year: 2024 }])).toThrow('Duplicate reporting key')
    },
  )

  it('keeps independently optional pollutant quantities with a shared variable and named laboratory', () => {
    const schema = section('emissie')
    const validator = new SchemaValidator()
    const data = load('lucht/emissie')
    for (const index of [0, 1, 2]) {
      const single = structuredClone(data)
      const pollutant = single.emissie[0].hasMember[1]
      pollutant.hasMember = [pollutant.hasMember[index]]
      expect(validator.validateInstance(schema, single).errors).toEqual([])
      pollutant.hasMember[0].hasResult.numericValue = -0.5
      expect(validator.validateInstance(schema, single).valid).toBe(false)
    }
    for (const change of ['no-variable', 'no-results', 'empty-lab', 'fractional-deviation', 'large-deviation']) {
      const invalid = structuredClone(data)
      const pollutant = invalid.emissie[0].hasMember[1]
      if (change === 'no-variable') pollutant.additionalProperty.shift()
      if (change === 'no-results') pollutant.hasMember = []
      if (change === 'empty-lab') pollutant.wasAssociatedWith = {}
      if (change === 'fractional-deviation') pollutant.additionalProperty[1].value = 0.5
      if (change === 'large-deviation') pollutant.additionalProperty[1].value = 101
      expect(validator.validateInstance(schema, invalid).valid, change).toBe(false)
    }
  })

  it('rejects missing and ambiguous reporting entries instead of silently choosing a theme', () => {
    const source = JSON.parse(sourceSnapshot())
    delete source['x-reporting-entries']
    expect(() => new ThemeResolver().resolveAllThemes(new CodelistParser().parseData(source)))
      .toThrow('Missing source reporting entries')
    source['x-reporting-entries'] = [{ schemeId: 'conceptscheme:missing', slug: 'missing', label: 'Missing' }]
    expect(() => new ThemeResolver().resolveAllThemes(new CodelistParser().parseData(source)))
      .toThrow('Missing reporting entry scheme')
    source['x-reporting-entries'] = [{ label: 'Incomplete' }]
    expect(() => new CodelistParser().parseData(source)).toThrow('Invalid reporting entries')
  })
})
