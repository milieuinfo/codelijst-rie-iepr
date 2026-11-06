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
    expect(schemaObject(input.properties!.type)['x-ui-after']).toBe('featureBron')
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
