import { describe, expect, it } from 'vitest'
import { CodelistParser } from '../src/services/codelist-parser.js'
import { ConceptMapper } from '../src/services/concept-mapper.js'
import { CompositeGroupBuilder } from '../src/services/composite-group-builder.js'
import { ChainComposer } from '../src/services/chain-composer.js'
import { SchemaAssembler } from '../src/services/schema-assembler.js'
import { SchemaValidator } from '../src/services/schema-validator.js'
import type { JsonSchemaObject, JsonSchemaValue } from '../src/models/index.js'

type Definitions = Record<string, Record<string, unknown>>
const sosa = 'http://www.w3.org/ns/sosa/'
const unit = 'https://example.test/unit/U'

function compile(definitions: Definitions): JsonSchemaObject {
  const result = new CodelistParser().parseData({
    '@context': {
      x: 'https://example.test/concept/', sosa, xsd: 'http://www.w3.org/2001/XMLSchema#',
      qudt: 'http://qudt.org/schema/qudt/', dcterms: 'http://purl.org/dc/terms/',
    },
    graph: Object.entries(definitions).map(([id, fields]) => ({
      id, _type: ['skos:Concept'], prefLabel: id, inScheme: 'x:section', ...fields,
    })),
  })
  const mapper = new ConceptMapper(result)
  const builder = new CompositeGroupBuilder(result, mapper)
  const fields = builder.buildNestedStructure([...result.concepts.values()]
    .filter(concept => concept.inScheme === 'x:section').map(concept => mapper.mapConcept(concept)!))
  const chain = {
    themeConcept: { id: 'x:unrelated-theme', prefLabel: 'Unrelated theme' },
    schemeIds: [], structuralChains: new Map<string, string>(), leafSchemeId: '',
  }
  return new SchemaAssembler({}).assemble('Synthetic', fields, null, chain, result).domainSchema
}

function node(value: JsonSchemaValue | undefined): JsonSchemaObject {
  if (!value || typeof value !== 'object') throw new Error('Expected a schema object')
  return value
}

function property(schema: JsonSchemaObject, name: string): JsonSchemaObject {
  return node(schema.properties?.[name])
}

function accepts(schema: JsonSchemaObject, data: unknown): boolean {
  return new SchemaValidator().validateInstance(schema, data).valid
}

const hierarchy: Definitions = {
  'x:report': { relevantClass: 'sosa:ObservationCollection', isMeervoudig: true },
  'x:sample': { broaderPartitive: 'x:report', relation: 'sosa:hasFeatureOfInterest', relevantClass: 'sosa:Sample', isVerplicht: true },
  'x:identifier': { broaderPartitive: 'x:sample', relation: 'dcterms:identifier', relevantDataType: 'xsd:string' },
  'x:sampling': { broaderPartitive: 'x:sample', relation: 'sosa:isResultOf', relevantClass: 'sosa:Sampling', isVerplicht: true },
  'x:timestamp': { broaderPartitive: 'x:sampling', relation: 'sosa:resultTime', relevantDataType: 'xsd:dateTime' },
  'x:sources': { broaderPartitive: 'x:sampling', relation: 'sosa:hasFeatureOfInterest', relevantRiepr: ['x:filter'], isMultiselect: true },
  'x:parameters': { broaderPartitive: 'x:report', relation: 'sosa:hasMember', relevantClass: 'sosa:Observation', isMeervoudig: true },
  'x:analysis-time': { broaderPartitive: 'x:parameters', relation: 'sosa:resultTime', relevantDataType: 'xsd:dateTime' },
  'x:value': { broaderPartitive: 'x:parameters', relation: 'sosa:hasResult', relevantDataType: 'xsd:decimal', relevantUnit: [unit], isVerplicht: true },
}

describe('Hierarchy-preserving compiler', () => {
  it('disambiguates root selectors by source identity without discarding either relation', () => {
    const schema = compile({
      'x:feature-one': { relation: 'sosa:hasFeatureOfInterest', relevantRiepr: ['x:system-one'] },
      'x:feature-two': { relation: 'sosa:hasFeatureOfInterest', relevantRiepr: ['x:system-two'] },
    })
    expect(Object.keys(schema.properties!)).toEqual(['featureOne', 'featureTwo'])
    expect(property(schema, 'featureOne')['x-jsonld-id']).toBe(sosa + 'hasFeatureOfInterest')
    expect(property(schema, 'featureTwo')['x-jsonld-id']).toBe(sosa + 'hasFeatureOfInterest')
    expect(property(schema, 'featureOne')['x-reference-types']).toEqual(['https://example.test/concept/system-one'])
    expect(property(schema, 'featureTwo')['x-reference-types']).toEqual(['https://example.test/concept/system-two'])
  })

  it.each(['xsd:integer', 'xsd:decimal'])('gives a unitless numeric RIEPR Observation a typed Resultaat (%s)', datatype => {
    const schema = compile({
      'x:reading': { relevantClass: 'riepr:Observatie', relevantDataType: datatype },
    })
    const observation = property(schema, 'reading')
    const result = property(observation, 'hasResult')
    expect(result['x-jsonld-id']).toBe(sosa + 'hasResult')
    expect(result['x-jsonld-type']).toBe('https://data.riepr.omgeving.vlaanderen.be/ns/riepr#Resultaat')
    expect(result.properties?.hasUnit).toBeUndefined()
    expect(observation['x-value-path']).toEqual(['hasResult', 'numericValue'])
    const reading = {
      observedProperty: 'https://example.test/concept/reading', hasResult: { numericValue: 0 },
    }
    expect(accepts(schema, { reading })).toBe(true)
    expect(accepts(schema, { reading: { ...reading, hasResult: 0 } })).toBe(false)
    expect(accepts(schema, { reading: { ...reading, hasResult: { numericValue: '0' } } })).toBe(false)
    expect(accepts(schema, { reading: { ...reading, hasResult: { numericValue: 1.25 } } }))
      .toBe(datatype === 'xsd:decimal')
  })

  it('publishes scalar top-level Observations as selectable sections, without treating context leaves as sections', () => {
    const result = new CodelistParser().parseData({
      '@context': { x: 'https://example.test/concept/', sosa, xsd: 'http://www.w3.org/2001/XMLSchema#' },
      graph: [
        { id: 'x:reading', _type: ['skos:Concept'], prefLabel: 'Reading', inScheme: 'x:section', relevantClass: 'sosa:Observation', relevantDataType: 'xsd:decimal' },
        { id: 'x:year', _type: ['skos:Concept'], prefLabel: 'Year', inScheme: 'x:section', relevantDataType: 'xsd:integer' },
      ],
    })
    const mapper = new ConceptMapper(result)
    const chain = {
      themeConcept: { id: 'x:theme', prefLabel: 'Synthetic' },
      schemeIds: ['x:section'], structuralChains: new Map<string, string>(), leafSchemeId: 'x:section',
    }
    const fields = new ChainComposer().composeThemeFields(result, chain, mapper, 'x:reading').fields
    const sections = new SchemaAssembler({}).assemble('Synthetic', fields, null, chain, result).subSchemas
    expect(sections.map(section => section.name)).toEqual(['reading'])
    expect(accepts(sections[0].schema, {
      year: 2024, reading: { observedProperty: 'https://example.test/concept/reading', hasResult: 1.25 },
    })).toBe(true)
    expect(() => new ChainComposer().composeThemeFields(result, chain, mapper, 'x:year'))
      .toThrow(/top-level reporting record/)
  })

  it('keeps one sample and sampling activity inside each collection and independent repeated observations', () => {
    const schema = compile(hierarchy)
    const report = node(property(schema, 'report').items)
    const sample = property(report, 'hasFeatureOfInterest')
    const sampling = property(sample, 'isResultOf')
    expect(sample.type).toBe('object')
    expect(sample['x-jsonld-type']).toBe(sosa + 'Sample')
    expect(sampling['x-jsonld-type']).toBe(sosa + 'Sampling')
    expect(property(sampling, 'hasFeatureOfInterest').type).toBe('array')
    expect(node(property(sampling, 'hasFeatureOfInterest').items)['x-jsonld-type']).toBe('@id')
    const observation = node(property(report, 'hasMember').items)
    expect(observation['x-jsonld-type']).toBe(sosa + 'Observation')
    expect(property(observation, 'hasResult')['x-jsonld-type']).toBe('http://qudt.org/schema/qudt/QuantityValue')
    const data = {
      report: [1, 2].map(n => ({
        hasFeatureOfInterest: {
          identifier: `00${n}`,
          isResultOf: { resultTime: '2024-01-02T10:00:00Z', hasFeatureOfInterest: ['urn:filter:1', 'urn:filter:2'] },
        },
        hasMember: [0, 0.123456789].map(numericValue => ({
          resultTime: '2024-01-03T11:00:00Z', hasResult: { numericValue, hasUnit: unit },
        })),
      })),
    }
    expect(accepts(schema, data)).toBe(true)
    data.report[0].hasMember[0].hasResult.hasUnit = 'urn:wrong:unit'
    expect(accepts(schema, data)).toBe(false)
    expect(accepts(schema, { report: [{ hasFeatureOfInterest: { isResultOf: {} }, hasMember: [] }] })).toBe(false)
  })

  it('supports extra collection levels and independent sibling arrays under non-domain identifiers', () => {
    const schema = compile({
      'x:outer': { relevantClass: 'sosa:ObservationCollection', isMeervoudig: true },
      'x:inner': { broaderPartitive: 'x:outer', relation: 'sosa:hasMember', relevantClass: 'sosa:ObservationCollection', isMeervoudig: true },
      'x:leaf': { broaderPartitive: 'x:inner', relation: 'sosa:hasMember', relevantClass: 'sosa:Observation', isMeervoudig: true },
      'x:value': { broaderPartitive: 'x:leaf', relevantDataType: 'xsd:integer', isVerplicht: true },
      'x:notes': { broaderPartitive: 'x:inner', isMeervoudig: true },
      'x:text': { broaderPartitive: 'x:notes', relevantDataType: 'xsd:string' },
    })
    const data = { outer: [{ hasMember: [{ hasMember: [{ value: 1 }, { value: 2 }], notes: [{ text: 'a' }, { text: 'b' }, {}] }] }] }
    expect(accepts(schema, data)).toBe(true)
    const inner = node(property(node(property(schema, 'outer').items), 'hasMember').items)
    expect(property(inner, 'notes').type).toBe('array')
    expect(node(property(inner, 'notes').items)['x-jsonld-type']).toBeUndefined()
    data.outer[0].hasMember[0].hasMember[0].value = 1.5
    expect(accepts(schema, data)).toBe(false)
  })

  it('does not invent observation envelopes for ordinary reporting records', () => {
    const schema = compile({
      'x:action': { isMeervoudig: true },
      'x:year': { broaderPartitive: 'x:action', relevantDataType: 'xsd:integer', minValue: 2000, maxValue: 2100 },
    })
    const action = node(property(schema, 'action').items)
    expect(Object.keys(action.properties!)).toEqual(['year'])
    expect(accepts(schema, { action: [{ year: 2027 }] })).toBe(true)
    expect(accepts(schema, { action: [{ year: 2101 }] })).toBe(false)
  })

  it('validates actual date, datetime, duration and mixed-format period values offline', () => {
    const schema = compile({
      'x:date': { relevantDataType: 'xsd:date' },
      'x:instant': { relevantDataType: 'xsd:dateTime' },
      'x:duration': { relevantDataType: 'xsd:duration' },
      'x:period': { relevantDataType: 'dcterms:temporal' },
    })
    const data = { date: '2024-02-29', instant: '2024-02-29T12:10:00Z', duration: 'PT1H30M', period: { start: '2024-01-01', end: '2024-12-31' } }
    expect(accepts(schema, data)).toBe(true)
    expect(accepts(schema, { ...data, date: '2023-02-29' })).toBe(false)
    expect(accepts(schema, { ...data, instant: '2024-02-29' })).toBe(false)
    expect(accepts(schema, { ...data, duration: '90 minutes' })).toBe(false)
    expect(accepts(schema, { ...data, period: { start: '2024-01-01', end: '2024-12-31T12:00:00Z' } })).toBe(false)
  })

  it.each([
    ['physical sample member', { ...hierarchy, 'x:parameters': { ...hierarchy['x:parameters'], relevantClass: 'sosa:Sample' } }, /Invalid collection member/],
    ['collection result', { ...hierarchy, 'x:bad-result': { broaderPartitive: 'x:report', relation: 'sosa:hasResult', relevantDataType: 'xsd:decimal' } }, /cannot own a member result/],
    ['multi-valued shared feature', { ...hierarchy, 'x:sample': { ...hierarchy['x:sample'], isMeervoudig: true } }, /maximum cardinality one/],
    ['missing parent', { 'x:field': { broaderPartitive: 'x:missing', relevantDataType: 'xsd:string' } }, /parent/i],
    ['ownership cycle', { 'x:a': { broaderPartitive: 'x:b' }, 'x:b': { broaderPartitive: 'x:a' } }, /cycle/i],
    ['untyped leaf', { 'x:a': {} }, /Missing or unsupported datatype/],
    ['mixed placeholder units', { 'x:a': { relevantDataType: 'xsd:decimal', relevantUnit: [unit, 'http://TODO'] } }, /Unresolved unit/],
  ] as const)('rejects %s explicitly', (_label, definitions, message) => {
    expect(() => compile(definitions)).toThrow(message)
  })
})

describe('Source-scoped variable references', () => {
  it.each([false, true])('resolves ancestor/singleton selectors including their value wrapper (singleton=%s)', singleton => {
    const schema = compile({
      'x:record': { isMeervoudig: true },
      ...(singleton ? { 'x:context': { broaderPartitive: 'x:record' } } : {}),
      'x:selection': {
        broaderPartitive: singleton ? 'x:context' : 'x:record',
        relevantClass: 'schema:PropertyValue', relevantDataType: 'xsd:string',
        relation: 'schema:additionalProperty',
      },
      'x:result': { broaderPartitive: 'x:record', relevantClass: 'riepr:Resultaat', relation: 'sosa:hasResult' },
      'x:value': {
        broaderPartitive: 'x:result', relevantDataType: 'xsd:decimal', relation: 'qudt:numericValue',
        variabele: 'x:selection',
      },
    })
    const value = property(property(node(property(schema, 'record').items), 'hasResult'), 'numericValue')
    expect(value['x-variabele']).toBe('additionalProperty')
    expect(value['x-variable-concept']).toBe('https://example.test/concept/selection')
    expect(value['x-variable-location']).toEqual({
      ancestorDepth: 1, path: [...(singleton ? ['context'] : []), 'additionalProperty', 'value'],
    })
  })

  it('rejects missing variables, cross-array references and multi-valued selectors', () => {
    const definitions: Definitions = {
      'x:first': { isMeervoudig: true },
      'x:second': { isMeervoudig: true },
      'x:selection': { broaderPartitive: 'x:first', relevantDataType: 'xsd:string' },
      'x:value': { broaderPartitive: 'x:second', relevantDataType: 'xsd:decimal', variabele: 'x:selection' },
    }
    expect(() => compile(definitions)).toThrow(/crosses independent record arrays/)
    expect(() => compile({
      ...definitions, 'x:value': { ...definitions['x:value'], variabele: 'x:missing' },
    })).toThrow(/Unresolved variable/)
    expect(() => compile({
      ...definitions, 'x:selection': { ...definitions['x:selection'], isMultiselect: true },
    })).toThrow(/must be a scalar value/)
  })
})

describe('Typed, scoped conditions', () => {
  it('preserves related variant identities, cardinalities and requiredness with a nested trigger', () => {
    const schema = compile({
      'x:record': { isMeervoudig: true },
      'x:result': { broaderPartitive: 'x:record', relevantClass: 'riepr:Resultaat', relation: 'sosa:hasResult' },
      'x:kind': { broaderPartitive: 'x:result', relevantDataType: 'xsd:string', relevantClass: 'schema:PropertyValue' },
      'x:variant-a': {
        broaderPartitive: 'x:record', relevantClass: 'http://www.w3.org/ns/prov#Agent',
        conditionPath: 'x:kind', conditionValue: 'a', related: ['x:variant-b'], isVerplicht: true,
      },
      'x:field-a': { broaderPartitive: 'x:variant-a', relevantDataType: 'xsd:string', relation: 'rdfs:label', prefLabel: 'Same' },
      'x:variant-b': {
        broaderPartitive: 'x:record', relevantClass: 'http://www.w3.org/ns/prov#Agent',
        conditionPath: 'x:kind', conditionValue: 'b', related: ['x:variant-a'], isVerplicht: true, isMeervoudig: true,
      },
      'x:field-b': { broaderPartitive: 'x:variant-b', relevantDataType: 'xsd:string', relation: 'rdfs:label', prefLabel: 'Same', isVerplicht: true },
    })
    const record = node(property(schema, 'record').items)
    const a = property(record, 'variantA')
    const b = node(property(record, 'variantB').items)
    expect(a['x-related-concepts']).toEqual(['https://example.test/concept/variant-b'])
    expect(property(a, 'label')['x-source-concept']).not.toBe(property(b, 'label')['x-source-concept'])
    expect(a.required).toBeUndefined()
    expect(b.required).toEqual(['label'])
    const result = (value: string) => ({ kind: { propertyID: 'https://example.test/concept/kind', value } })
    expect(accepts(schema, { record: [{ hasResult: result('a'), variantA: {} }] })).toBe(true)
    expect(accepts(schema, { record: [{ hasResult: result('a') }] })).toBe(false)
    expect(accepts(schema, { record: [{ hasResult: result('b'), variantB: [{ label: 'required' }] }] })).toBe(true)
    expect(accepts(schema, { record: [{ hasResult: result('b'), variantB: [{}] }] })).toBe(false)
    expect(accepts(schema, { record: [{ hasResult: result('b'), variantB: [] }] })).toBe(false)
    expect(accepts(schema, { record: [{ hasResult: result('b'), variantB: [{ label: 'required' }], variantA: {} }] })).toBe(false)
  })

  it.each([
    ['boolean', 'xsd:boolean', 'true', true, false, undefined],
    ['number', 'xsd:decimal', '1.25', 1.25, 2, undefined],
    ['quantity', 'xsd:decimal', '1.25', { numericValue: 1.25, hasUnit: unit }, { numericValue: 2, hasUnit: unit }, unit],
  ] as const)('enforces active/inactive requiredness for a %s trigger', (_label, datatype, conditionValue, active, inactive, relevantUnit) => {
    const schema = compile({
      'x:trigger': { relevantDataType: datatype, ...(relevantUnit ? { relevantUnit: [relevantUnit] } : {}) },
      'x:dependent': { relevantDataType: 'xsd:string', conditionPath: 'x:trigger', conditionValue, isVerplicht: true },
    })
    expect(accepts(schema, { trigger: active, dependent: 'entered' })).toBe(true)
    expect(accepts(schema, { trigger: active })).toBe(false)
    expect(accepts(schema, { trigger: inactive })).toBe(true)
    expect(accepts(schema, { trigger: inactive, dependent: 'must not be discarded' })).toBe(false)
    expect(accepts(schema, { dependent: 'missing trigger' })).toBe(false)
    expect(accepts(schema, {})).toBe(true)
  })

  it('tests numeric values inside scalar observation results', () => {
    const schema = compile({
      'x:trigger': { relevantDataType: 'xsd:decimal', relevantClass: 'sosa:Observation', relevantUnit: [unit] },
      'x:dependent': { relevantDataType: 'xsd:string', conditionPath: 'x:trigger', conditionValue: '0', isVerplicht: true },
    })
    const trigger = { observedProperty: 'https://example.test/concept/trigger', hasResult: { numericValue: 0, hasUnit: unit } }
    expect(accepts(schema, { trigger, dependent: 'zero is present' })).toBe(true)
    expect(accepts(schema, { trigger })).toBe(false)
  })

  it.each([false, true])('uses generic PropertyValue paths for numeric conditions (multiselect=%s)', isMultiselect => {
    const schema = compile({
      'x:trigger': {
        relevantClass: 'schema:PropertyValue', relevantDataType: 'xsd:decimal',
        relevantUnit: [unit, 'urn:other:unit'], isMultiselect, minValue: 0, maxValue: 2,
      },
      'x:dependent': { relevantDataType: 'xsd:string', conditionPath: 'x:trigger', conditionValue: '0', isVerplicht: true },
    })
    const value = { propertyID: 'https://example.test/concept/trigger', value: 0, unitCode: unit }
    const trigger = isMultiselect ? [value] : value
    expect(accepts(schema, { trigger, dependent: 'zero is present' })).toBe(true)
    expect(accepts(schema, { trigger })).toBe(false)
    expect(accepts(schema, { trigger: isMultiselect ? [{ ...value, value: 1 }] : { ...value, value: 1 } })).toBe(true)
    expect(accepts(schema, { trigger: isMultiselect ? [{ ...value, value: 3 }] : { ...value, value: 3 } })).toBe(false)
    expect(accepts(schema, { trigger: isMultiselect ? [{ ...value, unitCode: 'urn:other:unit' }] : { ...value, unitCode: 'urn:other:unit' }, dependent: 'valid alternate unit' })).toBe(true)
    expect(accepts(schema, { trigger: isMultiselect ? [{ ...value, unitCode: 'urn:wrong:unit' }] : { ...value, unitCode: 'urn:wrong:unit' }, dependent: 'invalid' })).toBe(false)
  })

  it('uses the literal numericValue condition and puts its unit on its owning object', () => {
    const schema = compile({
      'x:quantity': { relevantClass: 'qudt:QuantityValue' },
      'x:number': {
        broaderPartitive: 'x:quantity', relation: 'qudt:numericValue',
        relevantDataType: 'xsd:decimal', relevantUnit: [unit, 'urn:other:unit'],
      },
      'x:note': {
        broaderPartitive: 'x:quantity', relevantDataType: 'xsd:string',
        conditionPath: 'x:number', conditionValue: '0', isVerplicht: true,
      },
    })
    const quantity = property(schema, 'quantity')
    expect(property(quantity, 'numericValue').type).toBe('number')
    expect(property(quantity, 'hasUnit')['x-jsonld-id']).toBe('http://qudt.org/schema/qudt/hasUnit')
    expect(accepts(schema, { quantity: {} })).toBe(true)
    expect(accepts(schema, { quantity: { numericValue: 0, hasUnit: unit, note: 'zero' } })).toBe(true)
    expect(accepts(schema, { quantity: { numericValue: 0, hasUnit: unit } })).toBe(false)
    expect(accepts(schema, { quantity: { numericValue: 1, hasUnit: unit } })).toBe(true)
    expect(accepts(schema, { quantity: { numericValue: 1 } })).toBe(false)
  })

  it('applies ancestor conditions to every child record without joining sibling arrays', () => {
    const definitions: Definitions = {
      'x:enabled': { relevantDataType: 'xsd:boolean' },
      'x:records': { isMeervoudig: true },
      'x:child': { broaderPartitive: 'x:records', relevantDataType: 'xsd:string', conditionPath: 'x:enabled', conditionValue: 'true', isVerplicht: true },
    }
    const schema = compile(definitions)
    expect(accepts(schema, { enabled: true, records: [{ child: 'a' }, { child: 'b' }] })).toBe(true)
    expect(accepts(schema, { enabled: true, records: [{ child: 'a' }, {}] })).toBe(false)
    expect(accepts(schema, { enabled: false, records: [{ child: 'inactive' }] })).toBe(false)
    expect(() => compile({
      ...definitions,
      'x:other-records': { isMeervoudig: true },
      'x:enabled': { relevantDataType: 'xsd:boolean', broaderPartitive: 'x:other-records' },
    })).toThrow(/independent record arrays/)
  })

  it('rejects invalid numeric condition values rather than treating NaN as missingness', () => {
    expect(() => compile({
      'x:trigger': { relevantDataType: 'xsd:decimal' },
      'x:dependent': { relevantDataType: 'xsd:string', conditionPath: 'x:trigger', conditionValue: 'NaN' },
    })).toThrow(/Invalid numeric condition/)
  })

  it('keeps URI conditions and multiselect values as full references, not local names or labels', () => {
    const schema = compile({
      'x:options': { _type: ['skos:ConceptScheme'], hasTopConcept: ['x:Yes', 'x:No'] },
      'x:Yes': { inScheme: 'x:options', prefLabel: 'Same label' },
      'x:No': { inScheme: 'x:options', prefLabel: 'Same label' },
      'x:choice': { relevantCodeList: ['x:options'], isMultiselect: true },
      'x:dependent': { relevantDataType: 'xsd:string', conditionPath: 'x:choice', conditionValue: { id: 'x:Yes' }, isVerplicht: true },
    })
    expect(accepts(schema, { choice: ['https://example.test/concept/Yes'], dependent: 'entered' })).toBe(true)
    expect(accepts(schema, { choice: ['https://example.test/concept/Yes'] })).toBe(false)
    expect(accepts(schema, { choice: ['https://example.test/concept/No'], dependent: 'inactive' })).toBe(false)
    expect(accepts(schema, { choice: ['Yes'], dependent: 'not a URI' })).toBe(false)
  })

  it('rejects partial list resolution rather than silently narrowing choices', () => {
    expect(() => compile({
      'x:options': { _type: ['skos:ConceptScheme'], hasTopConcept: ['x:one'] },
      'x:one': { inScheme: 'x:options' },
      'x:choice': { relevantCodeList: ['x:options', 'x:missing-list'] },
    })).toThrow(/missing-list/)
  })
})
