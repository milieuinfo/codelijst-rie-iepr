import { describe, expect, it } from 'vitest'
import { CodelistParser } from '../src/services/codelist-parser.js'
import { ConceptMapper } from '../src/services/concept-mapper.js'
import { CompositeGroupBuilder } from '../src/services/composite-group-builder.js'
import { SchemaAssembler } from '../src/services/schema-assembler.js'
import { SemanticValidator } from '../src/services/semantic-validator.js'
import { SchemaValidator } from '../src/services/schema-validator.js'
import { personalizeReferenceSchema, parseReferenceData, referenceSnapshot } from '../src/services/reference-schema.js'
import { schemaObject } from '../src/services/schema-registry.js'

const relation = 'https://example.test/connectedTo'
const references = [
  { id: 'urn:point:a', label: 'Point A', types: ['urn:type:point'] },
  { id: 'urn:point:b', label: 'Point B', types: ['urn:type:point'] },
  { id: 'urn:source:a', label: 'Source A', types: ['urn:type:source'], relations: { [relation]: ['urn:point:a'] } },
  { id: 'urn:source:b', label: 'Source B', types: ['urn:type:source'], relations: { [relation]: ['urn:point:b'] } },
]

function compile(extra: Record<string, unknown> = {}, recordExtra: Record<string, unknown> = {},
  parentExtra: Record<string, unknown> = {}, extraConcepts: Record<string, unknown>[] = []) {
  const result = new CodelistParser().parseData({
    '@context': { test: 'https://example.test/', conceptscheme: 'https://example.test/schemes/' },
    graph: [
      { id: 'conceptscheme:records', _type: 'skos:ConceptScheme' },
      { id: 'test:records', _type: 'skos:Concept', prefLabel: 'Records', isMeervoudig: true,
        _table_key: ['test:point', 'test:sources'], ...recordExtra },
      { id: 'test:point', _type: 'skos:Concept', prefLabel: 'Point', broaderPartitive: 'test:records',
        relevantRiepr: ['urn:type:point'], relation: 'https://example.test/point', isVerplicht: true, ...parentExtra },
      { id: 'test:sources', _type: 'skos:Concept', prefLabel: 'Sources', broaderPartitive: 'test:records',
        relevantRiepr: ['urn:type:source'], isMultiselect: true, isVerplicht: true,
        referenceParent: 'test:point', referenceRelation: relation, relation: 'https://example.test/sources', ...extra },
      ...extraConcepts,
    ],
  })
  const mapper = new ConceptMapper(result)
  const fields = [...result.concepts.values()].flatMap(concept => {
    const mapped = mapper.mapConcept(concept)
    return mapped ? [mapped] : []
  })
  return new SchemaAssembler({}).assemble('Test', new CompositeGroupBuilder(result, mapper).buildNestedStructure(fields),
    null, { themeConcept: { id: 'test:theme', prefLabel: 'Test' }, schemeIds: [],
      structuralChains: new Map(), leafSchemeId: '' }, result).subSchemas[0].schema
}

describe('Source-declared structural selection dependencies', () => {
  it('compiles source metadata without navigation and retains the declared composite key', () => {
    const schema = compile()
    const row = schemaObject(schemaObject(schema.properties!.records).items)
    expect(row['x-table-key']).toEqual(['https://example.test/point', 'https://example.test/sources'])
    expect(schemaObject(row.properties!.sources)['x-reference-dependency']).toEqual({
      sourceConcept: 'https://example.test/point', relation,
    })
  })

  it('validates the named relationship in each row, not another selected reference or row', () => {
    const schema = compile()
    const validate = (records: unknown[]) => new SemanticValidator().validate(schema, { records }, { references })
    expect(validate([{ point: 'urn:point:a', sources: ['urn:source:a'] }])).toEqual([])
    expect(validate([{ point: 'urn:point:a', sources: ['urn:source:b'] },
      { point: 'urn:point:b', sources: ['urn:source:a'] }])).toHaveLength(2)
    expect(validate([{ sources: ['urn:source:a'] }])).toHaveLength(1)
    expect(new SemanticValidator().validate(schema, { records: [{ point: 'urn:point:a', sources: ['urn:source:a'] }] },
      { references: references.map(reference => ({ ...reference, relations: undefined, parents: ['urn:point:a'] })) }))
      .toHaveLength(1)
  })

  it('embeds relationships and enforces same-record connections with an ordinary personalized JSON Schema', () => {
    const schema = personalizeReferenceSchema(compile(), { references })
    const validator = new SchemaValidator()
    expect(validator.validateInstance(schema, { records: [{ point: 'urn:point:a', sources: ['urn:source:a'] }] }).valid).toBe(true)
    expect(validator.validateInstance(schema, { records: [{ point: 'urn:point:a', sources: ['urn:source:b'] }] }).valid).toBe(false)
    expect(validator.validateInstance(schema, { records: [{ sources: ['urn:source:a'] }] }).valid).toBe(false)
    expect(referenceSnapshot(schema)!.references).toEqual(references)
  })

  it('accepts multivalue parent selections and checks every dependent selection', () => {
    const schema = compile({}, {}, { isMeervoudig: true })
    const personalized = personalizeReferenceSchema(schema, { references })
    const value = { records: [{ point: ['urn:point:a', 'urn:point:b'], sources: ['urn:source:a', 'urn:source:b'] }] }
    expect(new SemanticValidator().validate(schema, value, { references })).toEqual([])
    expect(new SchemaValidator().validateInstance(personalized, value).valid).toBe(true)
    value.records[0].point = ['urn:point:a']
    expect(new SemanticValidator().validate(schema, value, { references })).toHaveLength(1)
    expect(new SchemaValidator().validateInstance(personalized, value).valid).toBe(false)
  })

  it('resolves canonical PropertyValue selections without borrowing another repeated record', () => {
    const schema = compile({}, { _table_key: ['test:sources'] }, {
      relevantClass: 'https://schema.org/PropertyValue', relation: 'https://schema.org/additionalProperty',
      isMeervoudig: true,
    })
    const value = { records: [{
      additionalProperty: [{ propertyID: 'https://example.test/point', value: 'urn:point:a' }],
      sources: ['urn:source:a'],
    }] }
    expect(new SemanticValidator().validate(schema, value, { references })).toEqual([])
    value.records[0].sources = ['urn:source:b']
    expect(new SemanticValidator().validate(schema, value, { references })).toHaveLength(1)
  })

  it('inherits singleton parent context into details but rejects independent repeated parent declarations', () => {
    const details = [{ id: 'test:details', _type: 'skos:Concept', prefLabel: 'Details',
      broaderPartitive: 'test:records', isMeervoudig: true }]
    const schema = compile({ broaderPartitive: 'test:details' }, { _table_key: ['test:point'] }, {}, details)
    const value = { records: [
      { point: 'urn:point:a', details: [{ sources: ['urn:source:a'] }] },
      { point: 'urn:point:b', details: [{ sources: ['urn:source:b'] }] },
    ] }
    expect(new SemanticValidator().validate(schema, value, { references })).toEqual([])
    value.records[0].details[0].sources = ['urn:source:b']
    expect(new SemanticValidator().validate(schema, value, { references })).toHaveLength(1)
    expect(() => compile({}, { _table_key: ['test:sources'] }, { broaderPartitive: 'test:details' }, details))
      .toThrow('crosses independent record arrays')
    expect(() => compile({ broaderPartitive: 'test:details' }, {}, {}, details))
      .toThrow('not an independent record')
  })

  it('rejects malformed or cyclic declarations and invalid relationship data', () => {
    expect(() => compile({ referenceParent: undefined })).toThrow('declared together')
    expect(() => compile({ referenceParent: 'test:missing' })).toThrow('Invalid referenceParent')
    expect(() => compile({ referenceParent: 'test:sources' })).toThrow('Cyclic reference dependency')
    expect(() => parseReferenceData([{ ...references[2], relations: { [relation]: [42] } }])).toThrow('Invalid reference')
    expect(() => parseReferenceData([{ ...references[2], relations: [] }])).toThrow()
    expect(() => compile({}, { _table_key: ['test:point', 'test:point'] })).toThrow('Invalid table key')
    expect(() => compile({}, { _table_key: ['test:missing'] })).toThrow('must be a scalar')
    expect(() => compile({}, { _table_key: ['test:records'] })).toThrow('must be a scalar')
  })
})
