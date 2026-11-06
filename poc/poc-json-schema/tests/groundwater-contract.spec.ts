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
    expect(property(record('kwaliteitsmeting'), 'identifier')['x-jsonld-id']).toBe('http://purl.org/dc/terms/identifier')
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
})

describe('Quality collections, implicit results and grouped feature input', () => {
  const quality = record('kwaliteitsmeting')
  const member = memberVariants(quality).find(variant => property(variant, 'observedProperty').enum)!
  const cube = property(member, 'hasResult')

  it('keeps monster context on the collection, the lab name in an Agent, and depth as a separate observation', () => {
    expect(JSON.stringify(quality)).not.toContain('http://www.w3.org/ns/sosa/Sample')
    expect(property(quality, 'identifier').type).toBe('string')
    expect(property(quality, 'wasAssociatedWith')['x-jsonld-type']).toBe('http://www.w3.org/ns/prov#Agent')
    expect(property(quality, 'wasAssociatedWith')['x-jsonld-id']).toBe('http://www.w3.org/ns/prov#wasAssociatedWith')
    expect(property(property(quality, 'wasAssociatedWith'), 'label')['x-jsonld-id'])
      .toBe('http://www.w3.org/2000/01/rdf-schema#label')
    const depth = memberVariants(quality).find(variant => property(variant, 'observedProperty').const)!
    expect(quality.properties).not.toHaveProperty('kwaliteitsmetingDiepte')
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
    const qualifier = propertyValue(cube, 'grondwater:kwaliteitsmeting-resultaten-limiet')
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
    expect(data.onttrekking[1].hasMember[2].hasResult.numericValue).toBe(10.123)
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
    expect(cube.required).toEqual(expect.arrayContaining(['numericValue', 'hasUnit', 'additionalProperty']))
    expect(property(cube, 'measurementMethod')['x-jsonld-id']).toBe('https://schema.org/measurementMethod')
    expect(property(propertyValue(cube, 'grondwater:peilmeting-referentiepunt'), 'value').type).toBe('string')
    expect(cube.allOf).toHaveLength(3)
    for (const name of ['numericValue', 'measurementMethod', 'peilmetingPomptoestand', 'peilmetingDuurStil']) {
      expect(level.properties).not.toHaveProperty(name)
    }
  })

  it('encodes the source PropertyValue components with their own identifiers and units', () => {
    for (const name of ['pomptoestand', 'duur-stil', 'volume-rust', 'volume-werking']) {
      const node = propertyValue(cube, `grondwater:peilmeting-${name}`)
      expect(node['x-jsonld-type']).toBe('https://schema.org/PropertyValue')
      expect(node['x-jsonld-id']).toBe('https://schema.org/additionalProperty')
      expect(property(node, 'propertyID')['x-jsonld-id']).toBe('https://schema.org/propertyID')
      expect(property(node, 'propertyID')['x-ui-hidden']).toBe(true)
    }
    expect(property(propertyValue(cube, 'grondwater:peilmeting-volume-rust'), 'unitCode')['x-jsonld-id']).toBe('https://schema.org/unitCode')
    expect(property(propertyValue(cube, 'grondwater:peilmeting-duur-stil'), 'value').format).toBe('duration')
  })

  it('rejects inactive components, wrong identifiers/units/durations and root-owned result data', () => {
    const measurement = example('peilmeting').peilmeting[0]
    const value = measurement.hasResult
    const changed = (suffix: string, change: Record<string, unknown>) => ({
      ...measurement, hasResult: { ...value, additionalProperty: value.additionalProperty.map((entry: { propertyID: string }) =>
        entry.propertyID.endsWith(`/peilmeting-${suffix}`) ? { ...entry, ...change } : entry) },
    })
    for (const invalid of [
      { ...measurement, numericValue: -2 },
      { ...measurement, hasResult: { ...value, numericValue: { numericValue: -2 } } },
      { ...measurement, hasResult: { ...value, hasUnit: 'urn:wrong:unit' } },
      { ...measurement, hasResult: { ...value, peilmetingReferentiepunt: ['urn:test:referentiepunt:maaiveld'] } },
      { ...measurement, hasResult: { ...value, additionalProperty: [
        ...value.additionalProperty, example('peilmeting').peilmeting[1].hasResult.additionalProperty.at(-1),
      ] } },
      changed('duur-stil', { value: '8 hours' }),
      changed('volume-rust', { propertyID: 'urn:wrong:property' }),
      changed('volume-rust', { unitCode: 'urn:wrong:unit' }),
    ]) expect(validator.validateInstance(schema('peilmeting'), { peilmeting: [invalid] }).valid, JSON.stringify(invalid)).toBe(false)
    for (const name of ['numericValue', 'referentiepunt']) {
      const data = example('peilmeting')
      if (name === 'referentiepunt') data.peilmeting[0].hasResult.additionalProperty.shift()
      else delete data.peilmeting[0].hasResult[name]
      expect(validator.validateInstance(schema('peilmeting'), data).valid).toBe(false)
    }
    expect(validator.validateInstance(schema('peilmeting'), { peilmeting: [{}] }).valid).toBe(false)
  })
})
