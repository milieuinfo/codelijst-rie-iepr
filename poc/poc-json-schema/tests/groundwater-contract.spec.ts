import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sourceSnapshot } from '../scripts/source-snapshot.mjs'
import { CodelistParser } from '../src/services/codelist-parser.js'
import { ConceptMapper } from '../src/services/concept-mapper.js'
import { ChainComposer } from '../src/services/chain-composer.js'
import { ThemeResolver } from '../src/services/theme-resolver.js'
import { SchemaValidator } from '../src/services/schema-validator.js'
import { SemanticValidator } from '../src/services/semantic-validator.js'
import { schemaObject } from '../src/services/schema-registry.js'
import { materializeDerivedValues } from '../src/services/derived-values.js'
import { compileGroundwater } from './groundwater-csv-fixture.js'

const source = JSON.parse(sourceSnapshot())
const result = new CodelistParser().parseData(source)
const chain = new ThemeResolver().resolveAllThemes(result).get('Grondwater')!
const sections = compileGroundwater(source).subSchemas
const schema = (name: string) => sections.find(section => section.name === name)!.schema
const property = (node: ReturnType<typeof schema>, name: string) => schemaObject(node.properties![name])
const record = (name: string) => schemaObject(property(schema(name), name).items)
const example = (name: string) => JSON.parse(readFileSync(new URL(`../examples/grondwater/${name}.json`, import.meta.url), 'utf8'))
const references = JSON.parse(readFileSync(new URL('../examples/refs.json', import.meta.url), 'utf8'))
const validator = new SchemaValidator()

describe('Current groundwater CSV source contract (no cached schemas)', () => {
  it('generates exactly three sections without thematypes or other operational flows', () => {
    expect(sections.map(section => section.name).sort()).toEqual(['kwaliteitsmeting', 'onttrekking', 'peilmeting'])
    expect(result.schemes.has('conceptscheme:thematypes')).toBe(false)
    expect(result.schemes.has('conceptscheme:operationeel_lucht')).toBe(false)
    for (const section of sections) expect(JSON.stringify(section.schema)).not.toContain('"@id":{')
  })

  it('accepts expanded section identities and rejects nested fields or structural selectors as sections', () => {
    const composer = new ChainComposer()
    const mapper = new ConceptMapper(result)
    expect(composer.composeThemeFields(result, chain, mapper, result.expandCurie!('grondwater:kwaliteitsmeting')).fields)
      .toEqual(composer.composeThemeFields(result, chain, mapper, 'grondwater:kwaliteitsmeting').fields)
    for (const id of ['grondwater:kwaliteitsmeting-resultaten-meetwaarde', 'grondwater:onttrekking-feature']) {
      expect(() => composer.composeThemeFields(result, chain, mapper, id)).toThrow(/top-level reporting record/)
    }
    expect(compileGroundwater(source, 'grondwater:kwaliteitsmeting').subSchemas.map(section => section.name))
      .toEqual(['kwaliteitsmeting'])
  })

  it.each(['onttrekking', 'peilmeting', 'kwaliteitsmeting'])('validates the persistent %s example structurally and semantically offline', name => {
    const data = example(name)
    expect(validator.validateInstance(schema(name), data)).toEqual({ valid: true, errors: [] })
    expect(new SemanticValidator().validate(schema(name), data, {
      references, referenceContext: { year: 2024 },
    })).toEqual([])
  })
})

describe('Quality collections, implicit results and grouped feature input', () => {
  const quality = record('kwaliteitsmeting')
  const member = schemaObject(property(quality, 'hasMember').items)
  const cube = property(member, 'hasResult')

  it('keeps monster context on the collection, the lab name in an Agent, and depth as a separate observation', () => {
    expect(JSON.stringify(quality)).not.toContain('http://www.w3.org/ns/sosa/Sample')
    expect(property(quality, 'identifier').type).toBe('string')
    expect(property(quality, 'kwaliteitsmetingLabo')['x-jsonld-type']).toBe('http://www.w3.org/ns/prov#Agent')
    expect(property(property(quality, 'kwaliteitsmetingLabo'), 'label')['x-jsonld-id'])
      .toBe('http://www.w3.org/2000/01/rdf-schema#label')
    const depth = property(quality, 'kwaliteitsmetingDiepte')
    expect(depth['x-jsonld-id']).toBe('http://www.w3.org/ns/sosa/hasMember')
    expect(property(depth, 'hasResult')['x-jsonld-type']).toBe(result.expandCurie!('riepr:Resultaat'))
    expect(property(property(depth, 'hasResult'), 'numericValue').type).toBe('number')
  })

  it('uses the selected filters as input for one constructed feature rather than several direct SOSA features', () => {
    const filter = schemaObject(property(quality, 'hasFeatureOfInterest').items)
    expect(filter['x-jsonld-id']).toBeUndefined()
    expect(filter['x-feature-mapping']).toMatchObject({
      relation: 'http://www.w3.org/ns/sosa/hasFeatureOfInterest',
      classes: [result.expandCurie!('riepr:Emissie')],
    })
    expect(property(record('onttrekking'), 'hasFeatureOfInterest')['x-feature-mapping']).toMatchObject({
      classes: [result.expandCurie!('riepr:Onttrekking')],
    })
  })

  it('puts all non-SOSA parameter characteristics inside Resultaat and resolves the source variable', () => {
    expect(property(member, 'observedProperty')['x-jsonld-type']).toBe('@id')
    expect(property(cube, 'numericValue')['x-variabele']).toBe('observedProperty')
    expect(cube['x-jsonld-type']).toBe(result.expandCurie!('riepr:Resultaat'))
    for (const name of ['additionalProperty', 'measurementMethod', 'type']) {
      expect(member.properties).not.toHaveProperty(name)
      expect(property(cube, name)['x-jsonld-id']).toBeDefined()
    }
    expect(property(cube, 'measurementMethod')['x-jsonld-id']).toBe('https://schema.org/measurementMethod')
    expect(property(cube, 'type')['x-jsonld-id']).toBe('http://purl.org/dc/terms/type')
    const qualifier = property(cube, 'additionalProperty')
    expect(qualifier['x-jsonld-type']).toBe('https://schema.org/PropertyValue')
    expect(property(qualifier, 'propertyID').const).toBe(result.expandCurie!('grondwater:kwaliteitsmeting-resultaten-limiet'))
    expect(property(qualifier, 'value')['x-jsonld-id']).toBe('https://schema.org/value')
    expect(property(qualifier, 'value')['x-jsonld-type']).toBe('@id')
    for (const name of ['kwaliteitsmetingResultatenLimiet', 'kwaliteitsmetingResultatenMethode', 'kwaliteitsmetingBemonsteringsinstrument']) {
      expect(cube.properties).not.toHaveProperty(name)
    }
  })

  it('rejects invalid collection dates and wrong result units at their exact paths', () => {
    const data = example('kwaliteitsmeting')
    data.kwaliteitsmeting[0].resultTime = 'not a datetime'
    data.kwaliteitsmeting[0].hasMember[0].hasResult.hasUnit = 'urn:wrong:unit'
    expect(validator.validateInstance(schema('kwaliteitsmeting'), data).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ instancePath: '/kwaliteitsmeting/0/resultTime', keyword: 'format' }),
      expect.objectContaining({ instancePath: '/kwaliteitsmeting/0/hasMember/0/hasResult/hasUnit', keyword: 'const' }),
    ]))
  })
})

describe('Reported debit quantity and optional singleton readings', () => {
  const debit = record('onttrekking')

  it('keeps independent readings and quantity, each with its implicit result, without calculating a volume', () => {
    expect(debit.required).toContain('onttrekkingHoeveelheid')
    for (const name of ['onttrekkingStartmeterstand', 'onttrekkingEindmeterstand', 'onttrekkingHoeveelheid']) {
      const observation = property(debit, name)
      expect(observation.type).toBe('object')
      expect(observation['x-jsonld-id']).toBe('http://www.w3.org/ns/sosa/hasMember')
      expect(property(observation, 'hasResult')['x-jsonld-type']).toBe(result.expandCurie!('riepr:Resultaat'))
    }
    expect(debit.required).not.toContain('onttrekkingStartmeterstand')
    expect(debit.required).not.toContain('onttrekkingEindmeterstand')
    const data = example('onttrekking')
    expect(data.onttrekking[0]).not.toHaveProperty('onttrekkingEindmeterstand')
    expect(data.onttrekking[0].onttrekkingHoeveelheid.hasResult.numericValue).toBe(0)
    expect(data.onttrekking[1].onttrekkingHoeveelheid.hasResult.numericValue).toBe(10.123)
  })

  it('shares Enddatum only inside its reporting row and does not create optional observations', () => {
    const data = example('onttrekking')
    delete data.onttrekking[1].onttrekkingEindmeterstand.resultTime
    const output = materializeDerivedValues(schema('onttrekking'), data)
    expect(output).toEqual(example('onttrekking'))
    expect(validator.validateInstance(schema('onttrekking'), output).errors).toEqual([])
    expect(property(property(debit, 'onttrekkingEindmeterstand'), 'resultTime')['x-ui-hidden']).toBe(true)
    expect(property(property(debit, 'onttrekkingHoeveelheid'), 'resultTime')['x-ui-hidden']).not.toBe(true)
  })

  it('rejects a missing reported quantity or end date, even if meter readings exist', () => {
    for (const field of ['onttrekkingHoeveelheid', 'resultTime']) {
      const data = example('onttrekking')
      if (field === 'resultTime') delete data.onttrekking[1].onttrekkingHoeveelheid.resultTime
      else delete data.onttrekking[1][field]
      expect(validator.validateInstance(schema('onttrekking'), data).errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ property: field, keyword: 'required' }),
      ]))
    }
  })
})

describe('Peilmeting RDF Cube result', () => {
  const level = record('peilmeting')
  const cube = property(level, 'hasResult')

  it('keeps depth, reference point and contextual characteristics in Resultaat, retaining declared predicates', () => {
    expect(cube['x-jsonld-id']).toBe('http://www.w3.org/ns/sosa/hasResult')
    expect(cube['x-jsonld-type']).toBe(result.expandCurie!('riepr:Resultaat'))
    expect(cube.required).toEqual(expect.arrayContaining(['numericValue', 'hasUnit', 'peilmetingReferentiepunt']))
    expect(property(cube, 'measurementMethod')['x-jsonld-id']).toBe('https://schema.org/measurementMethod')
    expect(property(cube, 'peilmetingReferentiepunt').type).toBe('string')
    expect(cube.allOf).toHaveLength(3)
    for (const name of ['numericValue', 'measurementMethod', 'peilmetingPomptoestand', 'peilmetingDuurStil']) {
      expect(level.properties).not.toHaveProperty(name)
    }
  })

  it('encodes the source PropertyValue components with their own identifiers and units', () => {
    for (const name of ['peilmetingPomptoestand', 'peilmetingDuurStil', 'peilmetingVolumeRust', 'peilmetingVolumeWerking']) {
      const node = property(cube, name)
      expect(node['x-jsonld-type']).toBe('https://schema.org/PropertyValue')
      expect(node['x-jsonld-id']).toBe('https://schema.org/additionalProperty')
      expect(property(node, 'propertyID')['x-jsonld-id']).toBe('https://schema.org/propertyID')
      expect(property(node, 'propertyID')['x-ui-hidden']).toBe(true)
    }
    expect(property(property(cube, 'peilmetingVolumeRust'), 'unitCode')['x-jsonld-id']).toBe('https://schema.org/unitCode')
    expect(property(property(cube, 'peilmetingDuurStil'), 'value').format).toBe('duration')
  })

  it('rejects inactive components, wrong identifiers/units/durations and root-owned result data', () => {
    const measurement = example('peilmeting').peilmeting[0]
    const value = measurement.hasResult
    for (const invalid of [
      { ...measurement, numericValue: -2 },
      { ...measurement, hasResult: { ...value, numericValue: { numericValue: -2 } } },
      { ...measurement, hasResult: { ...value, hasUnit: 'urn:wrong:unit' } },
      { ...measurement, hasResult: { ...value, peilmetingReferentiepunt: ['urn:test:referentiepunt:maaiveld'] } },
      { ...measurement, hasResult: { ...value, peilmetingVolumeWerking: example('peilmeting').peilmeting[1].hasResult.peilmetingVolumeWerking } },
      { ...measurement, hasResult: { ...value, peilmetingDuurStil: { ...value.peilmetingDuurStil, value: '8 hours' } } },
      { ...measurement, hasResult: { ...value, peilmetingVolumeRust: { ...value.peilmetingVolumeRust, propertyID: 'urn:wrong:property' } } },
      { ...measurement, hasResult: { ...value, peilmetingVolumeRust: { ...value.peilmetingVolumeRust, unitCode: 'urn:wrong:unit' } } },
    ]) expect(validator.validateInstance(schema('peilmeting'), { peilmeting: [invalid] }).valid, JSON.stringify(invalid)).toBe(false)
    for (const name of ['numericValue', 'peilmetingReferentiepunt']) {
      const data = example('peilmeting')
      delete data.peilmeting[0].hasResult[name]
      expect(validator.validateInstance(schema('peilmeting'), data).valid).toBe(false)
    }
    expect(validator.validateInstance(schema('peilmeting'), { peilmeting: [{}] }).valid).toBe(false)
  })
})
