import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Ajv2020 } from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { personalizeReferenceSchema, referenceSnapshot, parseReferenceData, parseReferenceContext } from '../src/services/reference-schema.js'
import { SchemaValidator } from '../src/services/schema-validator.js'
import { SemanticValidator, type ReferenceRecord } from '../src/services/semantic-validator.js'
import { presentationSchema } from '../src/services/member-layout.js'
import { schemaObject } from '../src/services/schema-registry.js'
import type { JsonSchemaObject } from '../src/models/json-schema.js'
import { sourceSnapshot } from '../scripts/source-snapshot.mjs'
import { compileGroundwater } from './groundwater-csv-fixture.js'

const type = 'urn:type:filter'
const reference = { type: 'string' as const, 'x-reference-types': [type] }
const generic: JsonSchemaObject = {
  $id: 'https://example.test/schema.json', $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object', additionalProperties: false, required: ['selected'],
  properties: { selected: reference, multiple: { type: 'array', items: reference } },
}
const refs: ReferenceRecord[] = [
  { id: 'urn:filter:current', label: 'Current', types: [type], year: 2024 },
  { id: 'urn:filter:old', label: 'Old', types: [type], year: 2023 },
  { id: 'urn:other', label: 'Other type', types: ['urn:type:other'], year: 2024 },
]
const validator = new SchemaValidator()

describe('Personal reference schemas', () => {
  it('keeps the generic schema unchanged and validates reference enums with ordinary offline AJV', () => {
    const before = structuredClone(generic)
    const personal = personalizeReferenceSchema(generic, { references: refs, referenceContext: { year: 2024 } })
    expect(generic).toEqual(before)
    expect(personal.$id).not.toBe(generic.$id)
    expect(schemaObject(personal.properties!.selected).enum).toEqual(['urn:filter:current'])
    expect(schemaObject(schemaObject(personal.properties!.multiple).items).enum).toEqual(['urn:filter:current'])
    expect(referenceSnapshot(personal)?.references).toEqual([refs[0]])
    const ajv = new Ajv2020({ strict: false })
    addFormats.default(ajv)
    const validate = ajv.compile(personal)
    expect(validate({ selected: refs[0].id, multiple: [refs[0].id] })).toBe(true)
    for (const id of ['urn:unknown', refs[1].id, refs[2].id]) {
      expect(validator.validateInstance(generic, { selected: id }).valid).toBe(true)
      expect(validate({ selected: id })).toBe(false)
    }
    expect(validate({})).toBe(false)
  })

  it('encodes no permitted choices as an impossible value, not invalid enum:[] or a permissive fallback', () => {
    const personal = personalizeReferenceSchema(generic, { references: refs, referenceContext: { year: 2026 } })
    expect(schemaObject(personal.properties!.selected).enum).toBeUndefined()
    expect(schemaObject(personal.properties!.selected).not).toEqual({})
    expect(validator.validateInstance(personal, { selected: refs[0].id }).valid).toBe(false)
    const optional = personalizeReferenceSchema({ ...generic, required: [] }, { references: [] })
    expect(validator.validateInstance(optional, {}).valid).toBe(true)
    expect(validator.validateInstance(optional, { multiple: [] }).valid).toBe(true)
    expect(validator.validateInstance(optional, { selected: 'anything' }).valid).toBe(false)
  })

  it('intersects existing enum/const constraints, accepts timeless references and is deterministic', () => {
    const timeless = { id: 'urn:timeless', label: 'Timeless', types: [type] }
    const input = {
      ...generic, properties: {
        selected: { ...reference, enum: [timeless.id, refs[0].id], const: timeless.id },
      },
    }
    const first = personalizeReferenceSchema(input, { references: [...refs, timeless] })
    const second = personalizeReferenceSchema(input, { references: [timeless, ...refs].reverse() })
    expect(first).toEqual(second)
    expect(schemaObject(first.properties!.selected).enum).toEqual([timeless.id])
    const changed = personalizeReferenceSchema(input, { references: [...refs, { ...timeless, label: 'New label' }] })
    expect(changed.$id).not.toBe(first.$id)
  })

  it('inlines offline refs and compositions without requiring dependency registration by the recipient', () => {
    const dependency: JsonSchemaObject = { $id: 'https://example.test/reference.json', $anchor: 'reference', ...reference }
    const input = {
      ...generic, properties: {
        selected: { $ref: dependency.$id + '#reference' },
        multiple: { type: 'array' as const, items: { oneOf: [{ $ref: dependency.$id + '#reference' }] } },
      },
    }
    const personal = personalizeReferenceSchema(input, {
      references: refs, referenceContext: { year: 2024 }, dependencies: [dependency],
    })
    expect(JSON.stringify(personal)).not.toContain('"$ref"')
    expect(validator.validateInstance(personal, { selected: refs[0].id, multiple: [refs[0].id] }).valid).toBe(true)
    expect(validator.validateInstance(personal, { selected: refs[0].id, multiple: [refs[1].id] }).valid).toBe(false)
    expect(() => personalizeReferenceSchema(input, { references: refs })).toThrow('Unresolved offline')
  })

  it('limits choices to possible parent context without mixing independent repeated records', () => {
    const parentType = 'urn:type:site'
    const parent = { id: 'urn:site:a', label: 'Site A', types: [parentType] }
    const child = { id: 'urn:child:a', label: 'Child A', types: [type], parents: [parent.id] }
    const outside = { id: 'urn:child:b', label: 'Child B', types: [type], parents: ['urn:site:b'] }
    const external = personalizeReferenceSchema(generic, {
      references: [child, outside], referenceContext: { ids: [parent.id] },
    })
    expect(schemaObject(external.properties!.selected).enum).toEqual([child.id])
    const nested: JsonSchemaObject = {
      $id: generic.$id, type: 'object', properties: {
        rows: { type: 'array', items: { type: 'object', properties: {
          site: { type: 'string', 'x-reference-types': [parentType] },
          selected: reference,
        } } },
        independent: { type: 'array', items: reference },
      },
    }
    const personal = personalizeReferenceSchema(nested, { references: [parent, child, outside] })
    const row = schemaObject(schemaObject(personal.properties!.rows).items)
    expect(schemaObject(row.properties!.selected).enum).toEqual([child.id])
    expect(schemaObject(schemaObject(personal.properties!.independent).items).not).toEqual({})
    const data = { rows: [{ selected: child.id }] }
    // Enum membership cannot assert that a possible parent was actually selected.
    expect(validator.validateInstance(personal, data).valid).toBe(true)
    expect(new SemanticValidator().validate(personal, data)).toEqual([
      expect.objectContaining({ keyword: 'reference', message: expect.stringContaining('parent context') }),
    ])
    expect(new SemanticValidator().validate(personal, { rows: [{ site: parent.id, selected: child.id }] })).toEqual([])
  })

  it('rejects invalid snapshots, duplicate identities and invalid context explicitly', () => {
    expect(() => parseReferenceData([refs[0], refs[0]])).toThrow('Duplicate')
    expect(() => parseReferenceData([{ ...refs[0], types: [] }])).toThrow('Invalid')
    expect(() => parseReferenceContext({ year: '2024' })).toThrow('Invalid')
    expect(() => parseReferenceContext({ ids: [42] })).toThrow('Invalid')
    const personal = personalizeReferenceSchema(generic, { references: refs })
    expect(() => personalizeReferenceSchema(personal, { references: refs })).toThrow('already personalized')
  })
})

describe('Real groundwater reference specialization', () => {
  const sections = compileGroundwater(JSON.parse(sourceSnapshot())).subSchemas
  const references = parseReferenceData(JSON.parse(readFileSync(new URL('../examples/refs.json', import.meta.url), 'utf8')))
  it.each(sections)('preserves canonical required members, PropertyValues and presentation for $name', ({ name, schema }) => {
    const personal = personalizeReferenceSchema(schema, { references, referenceContext: { year: 2024 } })
    const data = JSON.parse(readFileSync(new URL(`../examples/grondwater/${name}.json`, import.meta.url), 'utf8'))
    expect(validator.validateInstance(personal, data)).toEqual({ valid: true, errors: [] })
    expect(new SemanticValidator().validate(personal, data)).toEqual([])
    const visit = (node: JsonSchemaObject) => {
      if (node['x-reference-types'] && node.type === 'string') expect(node.enum).toBeInstanceOf(Array)
      for (const child of Object.values(node.properties ?? {})) visit(schemaObject(child))
      if (node.items) visit(schemaObject(node.items))
      for (const variant of Array.isArray(node.oneOf) ? node.oneOf : []) visit(schemaObject(variant))
    }
    visit(personal)
    visit(presentationSchema(personal))
    const changed = structuredClone(data)
    if (name === 'kwaliteitsmeting') changed[name][0].hasFeatureOfInterest = ['urn:unknown']
    else changed[name][0].hasFeatureOfInterest = 'urn:unknown'
    expect(validator.validateInstance(personal, changed).valid).toBe(false)
    if (name !== 'onttrekking') {
      const propertyData = structuredClone(data)
      const owner = name === 'peilmeting' ? propertyData[name][0].hasResult : propertyData[name][0]
      owner.additionalProperty[0].value = 'urn:unknown:reference-point'
      expect(validator.validateInstance(schema, propertyData).valid).toBe(true)
      expect(validator.validateInstance(personal, propertyData).valid).toBe(false)
    }
    expect(validator.validateInstance(personal, { [name]: [{}] }).valid).toBe(false)
  })
})
