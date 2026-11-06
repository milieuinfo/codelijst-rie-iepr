import { describe, expect, it } from 'vitest'
import type { JsonSchemaObject } from '../src/models/json-schema.js'
import {
  canonicalMemberSchema, canonicalDataPath, canonicalColumnPath,
  presentationDataPath, presentationSchema, transformMemberData,
} from '../src/services/member-layout.js'
import { materializeDerivedValues } from '../src/services/derived-values.js'
import { InstanceValidator } from '../src/services/instance-validator.js'
import { schemaObject } from '../src/services/schema-registry.js'

const observation = (concept: string): JsonSchemaObject => ({
  type: 'object', 'x-jsonld-id': 'http://www.w3.org/ns/sosa/hasMember',
  properties: { observedProperty: { type: 'string', const: concept }, value: { type: 'number' } },
  required: ['value'],
})
const input: JsonSchemaObject = {
  type: 'object', properties: {
    depth: observation('urn:depth'),
    measurements: {
      type: 'array', 'x-jsonld-id': 'http://www.w3.org/ns/sosa/hasMember',
      items: {
        ...observation('urn:unused'),
        properties: { observedProperty: { type: 'string', enum: ['urn:a', 'urn:b'] }, value: { type: 'number' } },
      },
    },
  },
}
const schema = canonicalMemberSchema(input)
const draft = { depth: { observedProperty: 'urn:depth', value: 0 },
  measurements: [{ observedProperty: 'urn:a', value: 12 }, { observedProperty: 'urn:b', value: 34 }] }
const canonical = { hasMember: [draft.depth, ...draft.measurements] }

describe('Canonical observation membership and presentation mapping', () => {
  it('also wraps a sole singleton observation in hasMember', () => {
    const schema = canonicalMemberSchema({ type: 'object', properties: { amount: observation('urn:amount') }, required: ['amount'] })
    expect(Object.keys(schema.properties!)).toEqual(['hasMember'])
    expect(schema.required).toEqual(['hasMember'])
    expect(transformMemberData(schema, { amount: { observedProperty: 'urn:amount', value: 0 } }, 'canonical'))
      .toEqual({ hasMember: [{ observedProperty: 'urn:amount', value: 0 }] })
  })

  it('preserves singleton and repeated values in both representations without mutating input', () => {
    expect(transformMemberData(schema, draft, 'canonical')).toEqual(canonical)
    expect(transformMemberData(schema, canonical, 'presentation')).toEqual(draft)
    const restored = presentationSchema(schema)
    expect(schemaObject(restored.properties!.depth).properties).toEqual(schemaObject(input.properties!.depth).properties)
    expect(schemaObject(restored.properties!.depth).required).toEqual(['value', 'observedProperty'])
    expect(schemaObject(schemaObject(restored.properties!.measurements).items).properties)
      .toEqual(schemaObject(schemaObject(input.properties!.measurements).items).properties)
    expect(Object.keys(draft)).toEqual(['depth', 'measurements'])
  })

  it('maps concrete paths with the offset of an existing singleton, including zero values', () => {
    for (const [presentation, canonicalPath] of [
      [['depth', 'value'], ['hasMember', 0, 'value']],
      [['measurements', 0, 'value'], ['hasMember', 1, 'value']],
      [['measurements', 1, 'value'], ['hasMember', 2, 'value']],
    ] as [Array<string | number>, Array<string | number>][]) {
      expect(canonicalDataPath(schema, draft, presentation)).toEqual(canonicalPath)
      expect(presentationDataPath(schema, canonical, canonicalPath)).toEqual(presentation)
    }
    expect(canonicalDataPath(schema, { measurements: draft.measurements }, ['measurements', 0, 'value']))
      .toEqual(['hasMember', 0, 'value'])
  })

  it('selects singleton columns by observedProperty rather than a fixed array index', () => {
    expect(canonicalColumnPath(schema, ['depth', 'value']))
      .toBe('$["hasMember"][?(@.observedProperty == "urn:depth")]["value"]')
  })

  it('does not reorder canonical members when materializing derived values', () => {
    const reordered = { hasMember: [canonical.hasMember[2], canonical.hasMember[0], canonical.hasMember[1]] }
    expect(materializeDerivedValues(schema, reordered)).toEqual(reordered)
  })

  it('discriminates nested collections by their declared class without inventing an observed property', () => {
    const type = 'https://data.riepr.omgeving.vlaanderen.be/ns/riepr#ObservatieVerzameling'
    const nested = {
      type: 'array', 'x-jsonld-id': 'http://www.w3.org/ns/sosa/hasMember',
      items: {
        type: 'object', additionalProperties: false, 'x-jsonld-type': type,
        properties: { amount: observation('urn:amount') }, required: ['amount'],
      },
    } satisfies JsonSchemaObject
    const schema = canonicalMemberSchema({
      type: 'object', properties: { depth: input.properties!.depth, nested }, required: ['depth', 'nested'],
    })
    const draft = { depth: { observedProperty: 'urn:depth', value: 0 },
      nested: [{ '@type': type, amount: { observedProperty: 'urn:amount', value: 0 } }] }
    const data = transformMemberData(schema, draft, 'canonical')
    expect(new InstanceValidator().validateInstance(schema, data).errors).toEqual([])
    expect(transformMemberData(schema, data, 'presentation')).toEqual(draft)
    expect(canonicalDataPath(schema, draft, ['nested', 0, 'amount', 'value']))
      .toEqual(['hasMember', 1, 'hasMember', 0, 'value'])
    expect(presentationDataPath(schema, data, ['hasMember', 1, 'hasMember', 0, 'value']))
      .toEqual(['nested', 0, 'amount', 'value'])
    expect(canonicalColumnPath(schema, ['nested', 'amount', 'value']))
      .toBe(`$["hasMember"][?(@["@type"] == "${type}")]["hasMember"][?(@.observedProperty == "urn:amount")]["value"]`)
    const missing = { hasMember: [draft.depth, { '@type': type, hasMember: [] }] }
    expect(new InstanceValidator().validateInstance(schema, missing).valid).toBe(false)
    expect(() => canonicalMemberSchema({
      type: 'object', properties: { first: nested, second: structuredClone(nested) },
    })).toThrow('ambiguous collection class discriminator')
  })
})

describe('Required members are enforced by standard JSON Schema keywords', () => {
  const validator = new InstanceValidator()
  const requiredSchema = canonicalMemberSchema({
    ...input, required: ['depth', 'measurements'],
    properties: {
      ...input.properties,
      measurements: { ...schemaObject(input.properties!.measurements), minItems: 2, maxItems: 3 },
    },
  })

  describe('Additional properties use predicate arrays discriminated by propertyID', () => {
    const propertyValue = (id: string, value: JsonSchemaObject): JsonSchemaObject => ({
      type: 'object', additionalProperties: false, required: ['propertyID', 'value'],
      'x-jsonld-id': 'https://schema.org/additionalProperty', 'x-jsonld-type': 'https://schema.org/PropertyValue',
      properties: {
        propertyID: { type: 'string', const: id, 'x-jsonld-id': 'https://schema.org/propertyID' },
        value: { ...value, 'x-jsonld-id': 'https://schema.org/value' },
      },
    })
    const original: JsonSchemaObject = {
      type: 'object', additionalProperties: false, required: ['references'],
      properties: {
        state: propertyValue('urn:state', { type: 'boolean' }),
        duration: propertyValue('urn:duration', { type: 'string', format: 'duration' }),
        references: { type: 'array', minItems: 1, items: propertyValue('urn:reference', { type: 'string' }),
          'x-jsonld-id': 'https://schema.org/additionalProperty' },
      },
      allOf: [{
        if: { required: ['state'], properties: { state: { properties: { value: { const: false } }, required: ['value'] } } },
        then: { required: ['duration'] },
        else: { properties: { duration: { not: {} } } },
      }],
    }
    const schema = canonicalMemberSchema(original)
    const draft = { state: { propertyID: 'urn:state', value: false },
      duration: { propertyID: 'urn:duration', value: 'PT8H' }, references: ['urn:point:1', 'urn:point:2'] }
    const data = { additionalProperty: [draft.state, draft.duration,
      ...draft.references.map(value => ({ propertyID: 'urn:reference', value }))] }
    const validator = new InstanceValidator()

    it('exports only the predicate array and keeps repeated reference selections inline on input', () => {
      expect(Object.keys(schema.properties!)).toEqual(['additionalProperty'])
      expect(transformMemberData(schema, draft, 'canonical')).toEqual(data)
      expect(transformMemberData(schema, data, 'presentation')).toEqual(draft)
      expect(presentationSchema(schema).allOf).toEqual(original.allOf)
      expect(schemaObject(schemaObject(presentationSchema(schema).properties!.references).items).type).toBe('string')
      expect(validator.validateInstance(schema, data)).toEqual({ valid: true, errors: [] })
    })

    it('preserves required kinds, values and singleton cardinalities independently of other properties', () => {
      for (const entries of [
        [draft.state, draft.duration],
        [...data.additionalProperty, draft.state],
        [{ propertyID: 'urn:reference' }],
        [{ value: 'urn:point:1' }],
        [{ propertyID: 'urn:unknown', value: 'urn:point:1' }],
      ]) expect(validator.validateInstance(schema, { additionalProperty: entries }).valid).toBe(false)
    })

    it('rewrites conditional required and forbidden fields to target the matching propertyID', () => {
      const active = { additionalProperty: [draft.state, data.additionalProperty[2]] }
      expect(validator.validateInstance(schema, active).valid).toBe(false)
      const inactive = { additionalProperty: [{ ...draft.state, value: true }, draft.duration, data.additionalProperty[2]] }
      expect(validator.validateInstance(schema, inactive).valid).toBe(false)
      inactive.additionalProperty.splice(1, 1)
      expect(validator.validateInstance(schema, inactive).valid).toBe(true)
      expect(validator.validateInstance(schema, { additionalProperty: [data.additionalProperty[2]] }).valid).toBe(true)
    })

    it('maps concrete selected values and filtered column paths to the canonical property list', () => {
      expect(canonicalDataPath(schema, draft, ['references', 1])).toEqual(['additionalProperty', 3, 'value'])
      expect(presentationDataPath(schema, data, ['additionalProperty', 3, 'value'])).toEqual(['references', 1])
      expect(canonicalColumnPath(schema, ['references']))
        .toBe('$["additionalProperty"][?(@.propertyID == "urn:reference")]["value"]')
    })
  })

  it('requires the array, the particular singleton concept and the required repeated observation type', () => {
    expect(validator.validateInstance(requiredSchema, canonical).valid).toBe(true)
    for (const data of [{}, { hasMember: [] }, { hasMember: canonical.hasMember.slice(1) },
      { hasMember: [draft.depth] }]) {
      expect(validator.validateInstance(requiredSchema, data).valid).toBe(false)
    }
    expect(validator.validateInstance(requiredSchema, { hasMember: draft.measurements }).errors)
      .toContainEqual(expect.objectContaining({ keyword: 'contains', schemaPath: '#/properties/hasMember/allOf/0/contains' }))
  })

  it('cannot satisfy required members with another concept or with incomplete member contents', () => {
    for (const member of [
      { observedProperty: 'urn:other', value: 0 },
      { value: 0 },
      { observedProperty: 'urn:depth' },
    ]) {
      expect(validator.validateInstance(requiredSchema, { hasMember: [member, ...draft.measurements] }).valid).toBe(false)
    }
  })

  it('reports a selected member missing a required field, not errors from other observation variants', () => {
    const result = validator.validateInstance(requiredSchema, {
      hasMember: [{ observedProperty: 'urn:depth' }, ...draft.measurements],
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([expect.objectContaining({
      keyword: 'required', property: 'value', instancePath: '/hasMember/0',
    })])
  })

  it('does not suppress ambiguous oneOf errors in unrelated schemas', () => {
    const result = validator.validateInstance({
      oneOf: [observation('urn:depth'), { type: 'object', required: ['observedProperty'] }],
    }, draft.depth)
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(expect.objectContaining({ keyword: 'oneOf' }))
  })

  it('preserves repeated bounds and singleton cardinalities independently of other members', () => {
    expect(validator.validateInstance(requiredSchema, { hasMember: [draft.depth, draft.measurements[0]] }).valid).toBe(false)
    expect(validator.validateInstance(requiredSchema, {
      hasMember: [draft.depth, ...draft.measurements, draft.measurements[0]],
    }).valid).toBe(true)
    expect(validator.validateInstance(requiredSchema, {
      hasMember: [draft.depth, ...draft.measurements, ...draft.measurements],
    }).valid).toBe(false)
    expect(validator.validateInstance(requiredSchema, {
      hasMember: [draft.depth, draft.depth, ...draft.measurements],
    }).valid).toBe(false)
  })

  it('checks required concepts in each collection, not across unrelated collection rows', () => {
    expect(validator.validateInstance({
      type: 'array', items: requiredSchema,
    }, [{ hasMember: [draft.depth] }, { hasMember: draft.measurements }]).valid).toBe(false)
  })

  it('also requires observedProperty when the collection has only one repeatable member type', () => {
    const schema = canonicalMemberSchema({
      type: 'object', properties: { hasMember: input.properties!.measurements }, required: ['hasMember'],
    })
    expect(validator.validateInstance(schema, { hasMember: draft.measurements }).valid).toBe(true)
    expect(validator.validateInstance(schema, { hasMember: [{ value: 12 }] }).valid).toBe(false)
  })
})
