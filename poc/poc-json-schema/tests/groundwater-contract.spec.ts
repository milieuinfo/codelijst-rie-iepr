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
import { memberVariants, presentationSchema } from '../src/services/member-layout.js'

const source = JSON.parse(sourceSnapshot())
const result = new CodelistParser().parseData(source)
const chain = new ThemeResolver().resolveAllThemes(result).get('Grondwater')!
const sections = compileGroundwater(source).subSchemas
const schema = (name: string) => sections.find(section => section.name === name)!.schema
const property = (node: ReturnType<typeof schema>, name: string) => schemaObject(node.properties![name])
const record = (name: string) => schemaObject(property(schema(name), name).items)
const propertyValues = (node: ReturnType<typeof schema>) => {
  const variants = schemaObject(property(node, 'additionalProperty').items).oneOf
  if (!Array.isArray(variants)) throw new Error('Missing PropertyValue variants.')
  return variants.map(schemaObject)
}
const propertyValue = (node: ReturnType<typeof schema>, concept: string) =>
  propertyValues(node).find(variant => property(variant, 'propertyID').const === result.expandCurie!(concept))!
const example = (name: string) => JSON.parse(readFileSync(new URL(`../examples/grondwater/${name}.json`, import.meta.url), 'utf8'))
const references = JSON.parse(readFileSync(new URL('../examples/refs.json', import.meta.url), 'utf8'))
const validator = new SchemaValidator()

describe('Current groundwater CSV source contract (no cached schemas)', () => {
  it('declares Monsternummer as the quality record key without adding an identifier field', () => {
    expect(record('kwaliteitsmeting')['x-table-key']).toEqual([
      result.expandCurie!('grondwater:kwaliteitsmeting-monsternummer'),
    ])
    expect(property(property(record('kwaliteitsmeting'), 'used'), 'identifier')['x-jsonld-id'])
      .toBe('http://purl.org/dc/terms/identifier')
  })

  it('requires a sample with a nonempty number for each quality measurement', () => {
    const data = example('kwaliteitsmeting')
    delete data.kwaliteitsmeting[0].used
    expect(validator.validateInstance(schema('kwaliteitsmeting'), data).valid).toBe(false)
    data.kwaliteitsmeting[0].used = {}
    expect(validator.validateInstance(schema('kwaliteitsmeting'), data).valid).toBe(false)
    data.kwaliteitsmeting[0].used.identifier = ''
    expect(validator.validateInstance(schema('kwaliteitsmeting'), data).valid).toBe(false)
  })

  it('maps every data property to an explicit predicate or declared feature-construction input', () => {
    const visit = (node: ReturnType<typeof schema>, envelope = false) => {
      for (const [key, value] of Object.entries(node.properties ?? {})) {
        const child = schemaObject(value)
        const feature = child['x-feature-mapping'] ?? (child.items && schemaObject(child.items)['x-feature-mapping'])
        if (!envelope && !feature) {
          expect(child['x-jsonld-id'], key).toMatch(/^https?:\/\//)
          expect(child['x-jsonld-id'], key).not.toBe(child['x-source-concept'])
        }
        visit(child)
      }
      if (node.items) visit(schemaObject(node.items))
      for (const variant of Array.isArray(node.oneOf) ? node.oneOf : []) visit(schemaObject(variant))
    }
    sections.forEach(section => visit(section.schema, true))
  })

  it('fails generation instead of inventing predicates for missing source relations', () => {
    for (const id of ['grondwater:kwaliteitsmeting-labo', 'grondwater:peilmeting-referentiepunt', 'grondwater:onttrekking-spui']) {
      const input = structuredClone(source)
      delete input.graph.find((node: { id: string }) => node.id === id).relation
      expect(() => compileGroundwater(input), id).toThrow('Missing relation')
    }
  })

  it('keeps the three groundwater sections isolated from air without thematypes', () => {
    expect(sections.map(section => section.name).sort()).toEqual(['kwaliteitsmeting', 'onttrekking', 'peilmeting'])
    expect(result.schemes.has('conceptscheme:thematypes')).toBe(false)
    expect(result.schemes.has('conceptscheme:operationeel_lucht')).toBe(true)
    expect(chain.schemeIds).toEqual(['conceptscheme:operationeel_grondwater'])
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

  it.each(['onttrekking', 'peilmeting', 'kwaliteitsmeting'])('requires the selected system in %s', name => {
    const data = example(name)
    delete data[name][0].hasFeatureOfInterest
    expect(validator.validateInstance(schema(name), data).valid).toBe(false)
  })
})

describe('Quality collections, implicit results and grouped feature input', () => {
  const quality = record('kwaliteitsmeting')
  const member = memberVariants(quality).find(variant =>
    property(variant, 'observedProperty').const === result.expandCurie!('grondwater:kwaliteitsmeting-resultaten-meetwaarde'))!
  const cube = property(member, 'hasResult')

  it('carries the CSV-declared ultimate feature source to Sampling schema metadata', () => {
    const mapped = structuredClone(source)
    const samplingConcept = mapped.graph.find((node: { id: string }) =>
      node.id === 'grondwater:kwaliteitsmeting-monstername')
    samplingConcept.ultimateFeatureOfInterestSource = 'grondwater:kwaliteitsmeting-feature'
    const mappedSchema = compileGroundwater(mapped).subSchemas.find(item => item.name === 'kwaliteitsmeting')!.schema
    const mappedQuality = schemaObject(schemaObject(mappedSchema.properties!.kwaliteitsmeting).items)
    const mappedSample = schemaObject(mappedQuality.properties!.used)
    const mappedSampling = schemaObject(mappedSample.properties!.isResultOf)
    expect(mappedSampling['x-ultimate-feature-of-interest-source'])
      .toBe(result.expandCurie!('grondwater:kwaliteitsmeting-feature'))
  })

  it('requires a result characteristic for every parameter without requiring a numeric value', () => {
    const data = example('kwaliteitsmeting')
    const result = data.kwaliteitsmeting[0].hasMember[1].hasResult
    delete data.kwaliteitsmeting[0].hasMember[1].hasResult
    expect(validator.validateInstance(schema('kwaliteitsmeting'), data).valid).toBe(false)
    data.kwaliteitsmeting[0].hasMember[1].hasResult = {}
    expect(validator.validateInstance(schema('kwaliteitsmeting'), data).valid).toBe(false)
    data.kwaliteitsmeting[0].hasMember[1].hasResult = { hasUnit: result.hasUnit }
    expect(validator.validateInstance(schema('kwaliteitsmeting'), data).valid).toBe(false)
    data.kwaliteitsmeting[0].hasMember[1].hasResult = {
      variabele: result.variabele, bepalingsgrensindicator: result.bepalingsgrensindicator,
    }
    expect(validator.validateInstance(schema('kwaliteitsmeting'), data).valid).toBe(true)
  })

  it('keeps sampling context on the sample and the lab in an Agent without obsolete depth or reference points', () => {
    const sample = property(quality, 'used')
    const sampling = property(sample, 'isResultOf')
    expect(sample['x-jsonld-type']).toBe(result.expandCurie!('riepr:Monster'))
    expect(sample['x-jsonld-id']).toBe('http://www.w3.org/ns/prov#used')
    expect(property(sample, 'identifier').type).toBe('string')
    expect(sampling['x-jsonld-type']).toBe('http://www.w3.org/ns/sosa/Sampling')
    expect(property(sampling, 'usedProcedure')['x-jsonld-id']).toBe('http://www.w3.org/ns/sosa/usedProcedure')
    expect(property(sampling, 'resultTime')['x-jsonld-id']).toBe('http://www.w3.org/ns/sosa/resultTime')
    expect(quality.properties).not.toHaveProperty('usedProcedure')
    expect(property(quality, 'wasAssociatedWith')['x-jsonld-type']).toBe('http://www.w3.org/ns/prov#Agent')
    expect(property(quality, 'wasAssociatedWith')['x-jsonld-id']).toBe('http://www.w3.org/ns/prov#wasAssociatedWith')
    expect(property(property(quality, 'wasAssociatedWith'), 'label')['x-jsonld-id'])
      .toBe('http://www.w3.org/2000/01/rdf-schema#label')
    expect(quality.properties).not.toHaveProperty('additionalProperty')
    expect(memberVariants(quality)).toEqual([member])
    expect(quality.properties).not.toHaveProperty('resultTime')
    expect(property(member, 'resultTime')['x-jsonld-id']).toBe('http://www.w3.org/ns/sosa/resultTime')
  })

  it('allows different analysis timestamps for results of the same sample', () => {
    const data = example('kwaliteitsmeting')
    expect(data.kwaliteitsmeting[0].hasMember[0].resultTime)
      .not.toBe(data.kwaliteitsmeting[0].hasMember[1].resultTime)
    expect(validator.validateInstance(schema('kwaliteitsmeting'), data).valid).toBe(true)
    expect(new SemanticValidator().validate(schema('kwaliteitsmeting'), data, {
      references, referenceContext: { year: 2024 },
    })).toEqual([])
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
    expect(property(cube, 'numericValue')['x-variable-location']).toEqual({
      ancestorDepth: 0, path: ['variabele'],
    })
    expect(cube['x-jsonld-type']).toBe(result.expandCurie!('riepr:Resultaat'))
    for (const name of ['variabele', 'bepalingsgrensindicator', 'measurementMethod', 'type']) {
      expect(member.properties).not.toHaveProperty(name)
      expect(property(cube, name)['x-jsonld-id']).toBeDefined()
    }
    expect(property(cube, 'measurementMethod')['x-jsonld-id']).toBe('https://schema.org/measurementMethod')
    expect(property(cube, 'type')['x-jsonld-id']).toBe('http://purl.org/dc/terms/type')
    const qualifier = property(cube, 'bepalingsgrensindicator')
    expect(qualifier['x-jsonld-id']).toBe('https://data.riepr.omgeving.vlaanderen.be/ns/vocab#bepalingsgrensindicator')
    expect(qualifier['x-jsonld-type']).toBe('@id')
    for (const name of ['kwaliteitsmetingResultatenLimiet', 'kwaliteitsmetingResultatenMethode', 'kwaliteitsmetingBemonsteringsinstrument']) {
      expect(cube.properties).not.toHaveProperty(name)
    }
  })

  it('rejects invalid analysis dates and wrong result units at their exact paths', () => {
    const data = example('kwaliteitsmeting')
    data.kwaliteitsmeting[0].hasMember[0].resultTime = 'not a datetime'
    data.kwaliteitsmeting[0].hasMember[0].hasResult.hasUnit = 'urn:wrong:unit'
    expect(validator.validateInstance(schema('kwaliteitsmeting'), data).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ instancePath: '/kwaliteitsmeting/0/hasMember/0/resultTime', keyword: 'format' }),
      expect.objectContaining({ instancePath: '/kwaliteitsmeting/0/hasMember/0/hasResult/hasUnit', keyword: 'const' }),
    ]))
  })
})

describe('Reported debit quantity and optional singleton readings', () => {
  const debit = record('onttrekking')
  const layout = schemaObject(property(presentationSchema(schema('onttrekking')), 'onttrekking').items)

  it('keeps independent readings and quantity, each with its implicit result, without calculating a volume', () => {
    expect(debit.required).toContain('hasMember')
    expect(debit.properties).not.toHaveProperty('onttrekkingHoeveelheid')
    expect(memberVariants(debit)).toHaveLength(3)
    for (const name of ['onttrekkingStartmeterstand', 'onttrekkingEindmeterstand', 'onttrekkingHoeveelheid']) {
      const observation = property(layout, name)
      expect(observation.type).toBe('object')
      expect(observation['x-jsonld-id']).toBe('http://www.w3.org/ns/sosa/hasMember')
      expect(property(observation, 'hasResult')['x-jsonld-type']).toBe(result.expandCurie!('riepr:Resultaat'))
    }
    expect(debit.required).not.toContain('onttrekkingStartmeterstand')
    expect(debit.required).not.toContain('onttrekkingEindmeterstand')
    const data = example('onttrekking')
    expect(data.onttrekking[0]).not.toHaveProperty('onttrekkingEindmeterstand')
    expect(data.onttrekking[0].hasMember[0].hasResult.numericValue).toBe(0)
    expect(data.onttrekking[1].hasMember[2].hasResult.numericValue).toBe(50)
  })

  it.each([-1, 1.5])('rejects invalid debit volumes and readings (%s) without rounding', value => {
    for (const index of [0, 1, 2]) {
      const data = example('onttrekking')
      data.onttrekking[1].hasMember[index].hasResult.numericValue = value
      expect(validator.validateInstance(schema('onttrekking'), data).valid).toBe(false)
    }
  })

  it('shares Enddatum only inside its reporting row and does not create optional observations', () => {
    const data = example('onttrekking')
    delete data.onttrekking[1].hasMember[1].resultTime
    const output = materializeDerivedValues(schema('onttrekking'), data)
    expect(output).toEqual(example('onttrekking'))
    expect(validator.validateInstance(schema('onttrekking'), output).errors).toEqual([])
    expect(property(property(layout, 'onttrekkingEindmeterstand'), 'resultTime')['x-ui-hidden']).toBe(true)
    expect(property(property(layout, 'onttrekkingHoeveelheid'), 'resultTime')['x-ui-hidden']).not.toBe(true)
  })

  it('rejects a missing reported quantity or end date, even if meter readings exist', () => {
    for (const field of ['onttrekkingHoeveelheid', 'resultTime']) {
      const data = example('onttrekking')
      if (field === 'resultTime') delete data.onttrekking[1].hasMember[2].resultTime
      else data.onttrekking[1].hasMember.pop()
      expect(validator.validateInstance(schema('onttrekking'), data).valid).toBe(false)
    }
  })

  it('rejects duplicate singleton members, unknown concepts and concept-named data properties', () => {
    const original = example('onttrekking')
    for (const change of ['duplicate', 'unknown', 'old-key']) {
      const data = structuredClone(original)
      const row = data.onttrekking[0]
      if (change === 'duplicate') row.hasMember.push(structuredClone(row.hasMember[0]))
      else if (change === 'unknown') row.hasMember[0].observedProperty = 'urn:unknown:property'
      else { row.onttrekkingHoeveelheid = row.hasMember[0]; delete row.hasMember }
      expect(validator.validateInstance(schema('onttrekking'), data).valid).toBe(false)
    }
  })
})

describe('Peilmeting RDF Cube result', () => {
  const level = record('peilmeting')
  const cube = property(level, 'hasResult')

  it('keeps depth, reference point and contextual characteristics in Resultaat, retaining declared predicates', () => {
    expect(cube['x-jsonld-id']).toBe('http://www.w3.org/ns/sosa/hasResult')
    expect(cube['x-jsonld-type']).toBe(result.expandCurie!('riepr:Resultaat'))
    expect(cube.required).toEqual(expect.arrayContaining(['numericValue', 'hasUnit', 'referentiepunt']))
    expect(property(cube, 'measurementMethod')['x-jsonld-id']).toBe('https://schema.org/measurementMethod')
    expect(property(cube, 'referentiepunt').type).toBe('string')
    expect(cube.allOf).toHaveLength(2)
    for (const name of ['numericValue', 'measurementMethod', 'peilmetingPomptoestand', 'peilmetingDuurStil']) {
      expect(level.properties).not.toHaveProperty(name)
    }
  })

  it('uses direct predicates for reference and pump state while preserving volume units', () => {
    for (const name of ['pomptoestand', 'duurPompenStil']) {
      expect(property(cube, name)['x-jsonld-id']).toBe(`https://data.riepr.omgeving.vlaanderen.be/ns/vocab#${name}`)
    }
    expect(property(property(cube, 'volumeVoorMeting'), 'hasUnit')['x-jsonld-id']).toBe('http://qudt.org/schema/qudt/hasUnit')
    expect(property(cube, 'duurPompenStil').format).toBe('duration')
  })

  it('rejects inactive components, wrong identifiers/units/durations and root-owned result data', () => {
    const measurement = example('peilmeting').peilmeting[0]
    const value = measurement.hasResult
    for (const invalid of [
      { ...measurement, numericValue: -2 },
      { ...measurement, hasResult: { ...value, numericValue: { numericValue: -2 } } },
      { ...measurement, hasResult: { ...value, hasUnit: 'urn:wrong:unit' } },
      { ...measurement, hasResult: { ...value, referentiepunt: ['urn:test:referentiepunt:maaiveld'] } },
      { ...measurement, hasResult: { ...value, volumeVoorMeting:
        example('peilmeting').peilmeting[1].hasResult.volumeVoorMeting } },
      { ...measurement, hasResult: { ...value, duurPompenStil: '8 hours' } },
      { ...measurement, hasResult: { ...value, additionalProperty: [
        {
          propertyID: result.expandCurie!('grondwater:peilmeting-volume-rust'), value: 0,
          unitCode: result.expandCurie!('csor_eenheid:E_32'),
        },
      ] } },
    ]) expect(validator.validateInstance(schema('peilmeting'), { peilmeting: [invalid] }).valid, JSON.stringify(invalid)).toBe(false)
    for (const name of ['numericValue', 'referentiepunt']) {
      const data = example('peilmeting')
      delete data.peilmeting[0].hasResult[name]
      expect(validator.validateInstance(schema('peilmeting'), data).valid).toBe(false)
    }
    expect(validator.validateInstance(schema('peilmeting'), { peilmeting: [{}] }).valid).toBe(false)
  })
})
