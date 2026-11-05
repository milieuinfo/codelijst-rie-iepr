import { describe, expect, it } from 'vitest'
import type { JsonSchemaObject } from '../src/models/index.js'
import { SemanticValidator } from '../src/services/semantic-validator.js'
import { SchemaValidator } from '../src/services/schema-validator.js'
import { SchemaRegistry } from '../src/services/schema-registry.js'
import { BaseSchemaGenerator } from '../src/services/base-schema-generator.js'

const sosa = 'http://www.w3.org/ns/sosa/'
const reference = { type: 'string' as const, 'x-jsonld-type': '@id', 'x-jsonld-id': sosa + 'hasFeatureOfInterest' }
const timestamp = { type: 'string' as const, format: 'date-time', 'x-jsonld-id': sosa + 'resultTime' }
const observation: JsonSchemaObject = {
  type: 'object', 'x-jsonld-type': sosa + 'Observation',
  properties: { feature: reference, timestamp },
}
const sample: JsonSchemaObject = {
  type: 'object', 'x-jsonld-type': sosa + 'Sample', 'x-jsonld-id': sosa + 'hasFeatureOfInterest',
  properties: {
    '@id': { type: 'string' },
    sampling: {
      type: 'object', 'x-jsonld-type': sosa + 'Sampling', 'x-jsonld-id': sosa + 'isResultOf',
      properties: { timestamp, feature: { type: 'array', items: reference } },
    },
  },
}

function collection(member: JsonSchemaObject = observation): JsonSchemaObject {
  return {
    type: 'object', 'x-jsonld-type': sosa + 'ObservationCollection',
    properties: {
      feature: reference, timestamp, sample,
      members: { type: 'array', items: member, 'x-jsonld-id': sosa + 'hasMember' },
    },
  }
}

describe('Selected 2020 homogeneous collection profile', () => {
  const validator = new SemanticValidator()

  it('inherits shared properties across arbitrary collection depth without requiring every collection to declare a feature', () => {
    const schema = collection(collection())
    expect(validator.validate(schema, {
      feature: 'urn:sample:1', members: [{ members: [{}, { feature: 'urn:sample:1' }] }],
    })).toEqual([])
    expect(validator.validate(schema, { members: [{ members: [{ feature: 'urn:sample:1' }] }] })).toEqual([])
    const errors = validator.validate(schema, {
      feature: 'urn:sample:1', members: [{ members: [{ feature: 'urn:sample:2' }] }],
    })
    expect(errors).toMatchObject([{ keyword: 'homogeneous', instancePath: '/members/0/members/0/feature' }])
    expect(errors[0].message).toContain('/feature')
  })

  it('does not confuse Sampling provenance or time with observation collection context', () => {
    expect(validator.validate(collection(), {
      sample: {
        '@id': 'urn:sample:1',
        sampling: { timestamp: '2024-01-01T10:00:00Z', feature: ['urn:filter:1', 'urn:filter:2'] },
      },
      members: [{ timestamp: '2024-01-02T11:00:00Z', feature: 'urn:sample:1' }],
    })).toEqual([])
  })

  it('detects collection/member shared-time conflicts at the actual child path', () => {
    expect(validator.validate(collection(), {
      timestamp: '2024-01-01T10:00:00Z', members: [{ timestamp: '2024-01-02T11:00:00Z' }],
    })).toMatchObject([{ instancePath: '/members/0/timestamp', keyword: 'homogeneous' }])
  })

  it('compares equivalent timezone instants without losing fractional-second precision', () => {
    expect(validator.validate(collection(), {
      timestamp: '2024-01-01T10:00:00.123400Z',
      members: [{ timestamp: '2024-01-01T12:00:00.1234+02:00' }],
    })).toEqual([])
    expect(validator.validate(collection(), {
      timestamp: '2024-01-01T10:00:00Z',
      members: [{ timestamp: '2024-01-01T05:00:00.000-05:00' }],
    })).toEqual([])
    expect(validator.validate(collection(), {
      timestamp: '2024-01-01T10:00:00.1234Z',
      members: [{ timestamp: '2024-01-01T10:00:00.1235Z' }],
    })).toMatchObject([{ instancePath: '/members/0/timestamp', keyword: 'homogeneous' }])
  })

  it('rejects physical Samples as members, empty collections, multi-valued shared properties and collection results', () => {
    expect(validator.validate(collection(sample), { members: [{ '@id': 'urn:sample:1' }] }))
      .toMatchObject([{ keyword: 'membership', instancePath: '/members' }])
    expect(validator.validate(collection(), { members: [] })).toMatchObject([{ keyword: 'membership' }])
    const multivalued = collection()
    multivalued.properties!.feature = { type: 'array', items: reference, 'x-jsonld-id': sosa + 'hasFeatureOfInterest' }
    expect(validator.validate(multivalued, { feature: ['urn:a'], members: [{}] }))
      .toMatchObject([{ keyword: 'homogeneous' }])
    const schema = collection()
    schema.properties!.result = { type: 'number', 'x-jsonld-id': sosa + 'hasSimpleResult' }
    expect(validator.validate(schema, { result: 5, members: [{}] }))
      .toMatchObject([{ keyword: 'membership', instancePath: '/result' }])
  })

  it('compares entity identities and reports conflicting definitions instead of accepting contradictory shared entities', () => {
    const member: JsonSchemaObject = { ...observation, properties: { sample } }
    const schema = collection(member)
    expect(validator.validate(schema, {
      sample: { '@id': 'urn:sample:1' }, members: [{ sample: { '@id': 'urn:sample:1' } }],
    })).toEqual([])
    expect(validator.validate(schema, {
      sample: { '@id': 'urn:sample:1' },
      members: [{ sample: { '@id': 'urn:sample:1', sampling: { timestamp: '2024-01-01T10:00:00Z' } } }],
    })).toMatchObject([{ keyword: 'identity', instancePath: '/members/0/sample' }])
  })

  it('checks structural reference existence and declared types using supplied reference data', () => {
    const schema: JsonSchemaObject = {
      type: 'array', items: { type: 'string', 'x-reference-types': ['urn:type:filter'] },
    }
    expect(validator.validate(schema, ['urn:filter:1'])[0].message).toContain('Reference data is required')
    const references = [{ id: 'urn:filter:1', label: 'Filter', types: ['urn:type:filter'] }]
    expect(validator.validate(schema, ['urn:filter:1'], { references })).toEqual([])
    expect(validator.validate(schema, ['urn:unknown'], { references })).toMatchObject([{ keyword: 'reference' }])
    expect(validator.validate(schema, ['urn:filter:1'], { references: [{ ...references[0], types: ['urn:type:other'] }] }))
      .toMatchObject([{ keyword: 'reference' }])
    expect(() => validator.validate(schema, [], { references: [...references, ...references] })).toThrow(/Duplicate reference/)
  })

  it('reports reversed temporal ranges separately from JSON Schema format errors', () => {
    const schema: JsonSchemaObject = {
      type: 'object', 'x-temporal-range': true, properties: { start: { type: 'string' }, end: { type: 'string' } },
    }
    expect(validator.validate(schema, { start: '2024-12-31', end: '2024-01-01' }))
      .toMatchObject([{ keyword: 'temporal-range' }])
    expect(validator.validate(schema, {
      start: '2024-01-01T10:00:00.1235Z', end: '2024-01-01T12:00:00.1234+02:00',
    })).toMatchObject([{ keyword: 'temporal-range' }])
    expect(validator.validate(schema, {
      start: '2024-01-01T12:00:00.123400+02:00', end: '2024-01-01T10:00:00.1234Z',
    })).toEqual([])
  })

  it('scopes structural choices by declared parent references and reporting year, not field names', () => {
    const schema: JsonSchemaObject = {
      type: 'object', properties: {
        a: { type: 'string', 'x-reference-types': ['urn:type:source'] },
        b: { type: 'array', items: { type: 'string', 'x-reference-types': ['urn:type:point'] } },
      },
    }
    const references = [
      { id: 'urn:source:1', label: 'Source', types: ['urn:type:source'], year: 2024, parents: ['urn:site:1'] },
      { id: 'urn:point:1', label: 'Point', types: ['urn:type:point'], year: 2024, parents: ['urn:source:1'] },
    ]
    const referenceContext = { year: 2024, ids: ['urn:site:1'] }
    expect(validator.validate(schema, { a: 'urn:source:1', b: ['urn:point:1'] }, { references, referenceContext })).toEqual([])
    expect(validator.validate(schema, { b: ['urn:point:1'] }, { references, referenceContext }))
      .toMatchObject([{ keyword: 'reference', instancePath: '/b/0', message: expect.stringContaining('parent context') }])
    expect(validator.validate(schema, { a: 'urn:source:1' }, { references, referenceContext: { ...referenceContext, year: 2025 } }))
      .toMatchObject([{ keyword: 'reference', message: expect.stringContaining('reporting year') }])
  })
})

describe('Offline schema validation', () => {
  const validator = new SchemaValidator()

  it('compiles both real base schemas and nested collection instances without network references', () => {
    const generator = new BaseSchemaGenerator()
    const observation = generator.generate()
    const collection = generator.generateCollection()
    expect(validator.validateInstance(collection, { hasMember: [{}, { hasMember: [{}] }] }, [observation]).valid).toBe(true)
    expect(validator.validateInstance(collection, { hasMember: [] }, [observation]).valid).toBe(false)
    expect(validator.validateInstance(collection, { hasFeatureOfInterest: ['urn:a'], hasMember: [{}] }).valid).toBe(false)
    expect(validator.validateInstance(collection, { hasResult: 1, hasMember: [{}] }).valid).toBe(false)
  })

  it('raises unresolved references as configuration errors instead of returning false', () => {
    expect(() => validator.validateInstance({ $ref: 'https://example.test/missing-schema' }, {}))
      .toThrow(/resolve reference/)
    const root: JsonSchemaObject = { $id: 'https://example.test/schema', $ref: 'missing' }
    expect(() => new SchemaRegistry(root).resolve(root)).toThrow(/Unresolved offline schema reference/)
  })

  it('resolves escaped pointers, anchors and explicit external resources and rejects ambiguous intersections', () => {
    const leaf: JsonSchemaObject = { type: 'integer', $anchor: 'count' }
    const root: JsonSchemaObject = {
      $id: 'https://example.test/root',
      $defs: { 'a/b~c': leaf },
      properties: { value: { $ref: '#/$defs/a~1b~0c' }, anchored: { $ref: '#count' } },
    }
    const registry = new SchemaRegistry(root)
    expect(registry.resolve(root.properties!.value as JsonSchemaObject).type).toBe('integer')
    expect(registry.resolve(root.properties!.anchored as JsonSchemaObject).type).toBe('integer')
    const external = { $id: 'https://example.test/external', type: 'number' as const }
    const reference = { $ref: external.$id }
    expect(new SchemaRegistry(reference, [external]).resolve(reference).type).toBe('number')
    const incompatible = { $ref: external.$id, type: 'string' as const }
    expect(() => new SchemaRegistry(incompatible, [external]).resolve(incompatible)).toThrow(/intersecting/)
  })

  it('returns precise instance diagnostics and enforces formats without mutating values', () => {
    const schema: JsonSchemaObject = {
      type: 'object', required: ['when'], additionalProperties: false,
      properties: { when: { type: 'string', format: 'date-time' } },
    }
    expect(validator.validateInstance(schema, { when: 'tomorrow' }).errors)
      .toMatchObject([{ instancePath: '/when', keyword: 'format' }])
    expect(validator.validateInstance(schema, { unexpected: false }).errors)
      .toEqual(expect.arrayContaining([expect.objectContaining({ property: 'when' }), expect.objectContaining({ property: 'unexpected' })]))
  })
})
