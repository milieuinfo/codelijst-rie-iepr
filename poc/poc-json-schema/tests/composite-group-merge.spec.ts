import { describe, it, expect } from 'vitest'
import { CodelistParser } from '../src/services/codelist-parser.js'
import { ConceptMapper } from '../src/services/concept-mapper.js'
import type { CodelistResult, SchemaField } from '../src/models/index.js'
import { CompositeGroupBuilder } from '../src/services/composite-group-builder.js'
import { ConditionalValidatorGenerator } from '../src/services/conditional-validator.js'

// --- Helper: build a fake codelist result with given concepts ---
function makeRawFixture(concepts: Record<string, Record<string, unknown>>): Record<string, unknown> {
  const nodes: Record<string, unknown>[] = []
  for (const [id, fields] of Object.entries(concepts)) {
    nodes.push({ id, _type: ['skos:Concept'], ...fields })
  }
  // Return proper JSON-LD document structure
  return {
    '@context': { skos: 'http://www.w3.org/2004/02/skos/core#' },
    graph: nodes,
  }
}

describe('CodelistParser parses related field', () => {
  it('preserves distinct nested fields that use the same relation predicate', () => {
    const result = new CodelistParser().parseData(makeRawFixture({
      'x:destination': { prefLabel: 'Destination' },
      'x:destination-name': {
        prefLabel: 'Name', relevantDataType: 'xsd:string',
        broaderPartitive: 'x:destination', relation: 'rdfs:label', isVerplicht: true,
      },
      'x:destination-address': {
        prefLabel: 'Address', relevantDataType: 'xsd:string',
        broaderPartitive: 'x:destination', relation: 'rdfs:label', isVerplicht: true,
      },
    }))
    const mapper = new ConceptMapper(result)
    const builder = new CompositeGroupBuilder(result, mapper)
    const fields = [...result.concepts.values()].map(concept => mapper.mapConcept(concept)!)
    const [destination] = builder.buildNestedStructure(fields)
    expect(destination.children?.map(child => child.propertyName)).toEqual([
      'destinationName', 'destinationAddress',
    ])
    const schema = builder.toSchemaProperties([destination]).properties.destination as {
      properties: Record<string, unknown>; required: string[]
    }
    expect(Object.keys(schema.properties)).toEqual(['destinationName', 'destinationAddress'])
    expect(schema.required).toEqual(['destinationName', 'destinationAddress'])
  })

  it('parses related as array of concept IDs', () => {
    const data = makeRawFixture({
      'x:parent': { prefLabel: 'Parent', related: ['y:a', 'y:b'] },
      'y:a': { prefLabel: 'A' },
      'y:b': { prefLabel: 'B' },
    })
    const result = new CodelistParser().parseData(data)
    expect(result.concepts.get('x:parent')?.related).toEqual(['y:a', 'y:b'])
  })

  it('leaves related undefined when key is absent', () => {
    const data = makeRawFixture({
      'x:normal': { prefLabel: 'Normal' },
    })
    const result = new CodelistParser().parseData(data)
    expect(result.concepts.get('x:normal')?.related).toBeUndefined()
  })

  it('parses related with embedded node objects (JSON-LD style)', () => {
    const data = makeRawFixture({
      'x:parent': { prefLabel: 'Parent', related: [{ id: 'y:a', _type: ['skos:Concept'] }] },
      'y:a': { prefLabel: 'A' },
    })
    const result = new CodelistParser().parseData(data)
    expect(result.concepts.get('x:parent')?.related).toContain('y:a')
  })
})

describe('CompositeGroupBuilder preserves related variant identities', () => {
  function buildFixture(
    parentIds: string[],
    childrenByParent: Record<string, Array<{ id: string; label: string; isVerplicht?: boolean; relation?: string }>>,
  ): CodelistResult {
    const concepts: Record<string, Record<string, unknown>> = {}

    // Create parent composite concepts (variants)
    for (const parentId of parentIds) {
      const localPart = parentId.split(':').pop()!
      concepts[parentId] = {
        prefLabel: 'TestGroup',
        conditionPath: `trigger:${localPart}`,
        conditionValue: localPart,
        broaderPartitive: [],
        related: parentIds.filter(id => id !== parentId),
      }
    }

    // Create child concepts
    for (const [parentId, children] of Object.entries(childrenByParent)) {
      for (const child of children) {
        concepts[child.id] = {
          prefLabel: child.label,
          relevantDataType: 'xsd:string',
          isVerplicht: child.isVerplicht === true ? 'true' : undefined,
          relation: child.relation || undefined,
          broaderPartitive: parentId,
        }
      }
    }

    return new CodelistParser().parseData(makeRawFixture(concepts))
  }

  it('keeps related composites and all their children separate', () => {
    const result = buildFixture(['x:variant-a', 'x:variant-b'], {
      'x:variant-a': [
        { id: 'x:child-1', label: 'Shared Field', isVerplicht: false },
        { id: 'x:child-a-only', label: 'Field A Only', isVerplicht: true },
      ],
      'x:variant-b': [
        { id: 'x:child-2', label: 'Field B Only', isVerplicht: true },
      ],
    })

    const mapper = new ConceptMapper(result)
    const compositeBuilder = new CompositeGroupBuilder(result, mapper)

    // Map all concepts to fields
    const allFields: SchemaField[] = []
    for (const c of result.concepts.values()) {
      const f = mapper.mapConcept(c)
      if (f) allFields.push(f)
    }

    const fields = compositeBuilder.buildNestedStructure(allFields)
    expect(fields.map(field => field.conceptId)).toEqual(['x:variant-a', 'x:variant-b'])
    expect(fields[0].children?.map(child => child.conceptId)).toEqual(['x:child-1', 'x:child-a-only'])
    expect(fields[1].children?.map(child => child.conceptId)).toEqual(['x:child-2'])
    expect(fields[0].extensions?.['x-related-concepts']).toEqual(['x:variant-b'])
  })

  it('preserves required fields inside each independently conditioned variant', () => {
    const result = buildFixture(['x:belgisch', 'x:buitenlands'], {
      'x:belgisch': [
        { id: 'x:on', label: 'Ondernemingsnummer', isVerplicht: true },
      ],
      'x:buitenlands': [
        { id: 'x:btw', label: 'BTW-nummer', isVerplicht: true },
      ],
    })

    const mapper = new ConceptMapper(result)
    const compositeBuilder = new CompositeGroupBuilder(result, mapper)

    const allFields: SchemaField[] = []
    for (const c of result.concepts.values()) {
      const f = mapper.mapConcept(c)
      if (f) allFields.push(f)
    }

    const fields = compositeBuilder.buildNestedStructure(allFields)
    expect(fields[0].condition?.values).toEqual(['belgisch'])
    expect(fields[1].condition?.values).toEqual(['buitenlands'])
    expect(fields[0].children?.[0].isRequired).toBe(true)
    expect(fields[1].children?.[0].isRequired).toBe(true)
  })

  it('does not deduplicate equal labels or mix their requiredness across variants', () => {
    const result = buildFixture(['x:variant1', 'x:variant2'], {
      'x:variant1': [
        { id: 'x:name-v1', label: 'Naam', isVerplicht: false },
        { id: 'x:on', label: 'Ondernemingsnummer', isVerplicht: true },
      ],
      'x:variant2': [
        { id: 'x:name-v2', label: 'Naam', isVerplicht: true },
        { id: 'x:btw', label: 'BTW-nummer', isVerplicht: true },
      ],
    })

    const mapper = new ConceptMapper(result)
    const compositeBuilder = new CompositeGroupBuilder(result, mapper)

    const allFields: SchemaField[] = []
    for (const c of result.concepts.values()) {
      const f = mapper.mapConcept(c)
      if (f) allFields.push(f)
    }

    const fields = compositeBuilder.buildNestedStructure(allFields)
    const names = fields.map(field => field.children!.find(child => child.label === 'Naam')!)
    expect(names.map(field => field.conceptId)).toEqual(['x:name-v1', 'x:name-v2'])
    expect(names.map(field => field.isRequired)).toEqual([false, true])
  })
})

describe('ConditionalValidatorGenerator handles condition.values array', () => {
  it('collects conditions with values arrays from fields at any nesting level', () => {
    const fields: SchemaField[] = [
      {
        conceptId: 'x:root',
        propertyName: 'root',
        label: 'Root',
        type: 'object',
        isRequired: false,
        isRepeatable: false,
        children: [
          {
            conceptId: 'x:child1',
            propertyName: 'child1',
            label: 'Child1',
            type: 'string',
            isRequired: false,
            isRepeatable: false,
            condition: { path: 'triggerType', values: ['val1', 'val2'] },
          },
          {
            conceptId: 'x:grandchild',
            propertyName: 'grandchild',
            label: 'Grandchild',
            type: 'string',
            isRequired: false,
            isRepeatable: false,
            condition: { path: 'triggerType', values: ['val3'] },
          },
        ],
      },
    ]

    const gen = new ConditionalValidatorGenerator()
    const conditions = gen.collectConditions(fields)

    // Should collect 3 conditions: child1(val1), child1(val2), grandchild(val3)
    expect(conditions).toHaveLength(3)
    expect(conditions.find(c => c.triggerValue === 'val1')).toBeDefined()
    expect(conditions.find(c => c.triggerValue === 'val2')).toBeDefined()
    expect(conditions.find(c => c.triggerValue === 'val3')).toBeDefined()
  })

  it('generates if/then blocks with anyOf for multiple trigger values', () => {
    const gen = new ConditionalValidatorGenerator()
    const block = gen.generateIfThen({
      triggerProperty: 'type',
      triggerValue: 'belgisch',
      conditionedProperty: 'bestemmingsidentificatie',
    })

    expect(block.if.properties.type.const).toBe('belgisch')
    expect(block.then.properties.bestemmingsidentificatie).toEqual({})
  })
})
