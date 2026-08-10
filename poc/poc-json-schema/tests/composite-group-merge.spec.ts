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

describe('CompositeGroupBuilder merges related variant groups', () => {
  function buildFixture(
    parentIds: string[],
    childrenByParent: Record<string, Array<{ id: string; label: string; isVerplicht?: boolean; relation?: string }>>,
  ): CodelistResult {
    const concepts: Record<string, unknown> = {}

    // Create parent composite concepts (variants)
    for (const parentId of parentIds) {
      const localPart = parentId.split(':').pop()!
      concepts[parentId] = {
        prefLabel: 'TestGroup',
        conditionPath: `trigger:${localPart}`,
        conditionValue: localPart,
        isPartOf: [],
        related: parentIds.filter(id => id !== parentId),
      }
    }

    // Create child concepts
    let ci = 0
    for (const [parentId, children] of Object.entries(childrenByParent)) {
      for (const child of children) {
        concepts[child.id] = {
          prefLabel: child.label,
          isVerplicht: child.isVerplicht === true ? 'true' : undefined,
          relation: child.relation || undefined,
          isPartOf: parentId,
        }
      }
    }

    return new CodelistParser().parseData(makeRawFixture(concepts))
  }

  it('merges two related composites into one object field with deduped children', () => {
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

    // Build nested structure
    let nestedFields = compositeBuilder.buildNestedStructure(allFields)

    // Merge related groups
    const mergedFields = compositeBuilder.mergeRelatedGroups(nestedFields)

    // Find the merged group — it should be a single field named after common prefix
    const mergedGroup = mergedFields.find(f => !Array.isArray(f.isPartOf) || f.isPartOf.length === 0)
    expect(mergedGroup).toBeDefined()
    expect(mergedGroup?.children).toBeDefined()
    expect(mergedGroup?.children!.length).toBeGreaterThan(1)

    // Check that children are deduplicated by label
    const childLabels = mergedGroup!.children!.map(c => c.label)
    expect(childLabels).toContain('Shared Field')
    expect(childLabels).toContain('Field A Only')
    expect(childLabels).toContain('Field B Only')
  })

  it('computes requiredConditions per variant value', () => {
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

    let nestedFields = compositeBuilder.buildNestedStructure(allFields)
    const mergedFields = compositeBuilder.mergeRelatedGroups(nestedFields)

    // Find the merged group
    const mergedGroup = mergedFields.find(f => !Array.isArray(f.isPartOf) || f.isPartOf.length === 0)
    expect(mergedGroup).toBeDefined()
    expect(mergedGroup?.type).toBe('object')
    expect(mergedGroup?.children).toBeDefined()

    // Check requiredConditions on children
    const childByLabel = new Map(mergedGroup!.children!.map(c => [c.label, c]))
    const ondernemingsnummer = childByLabel.get('Ondernemingsnummer')
    expect(ondernemingsnummer).toBeDefined()
    expect(ondernemingsnummer?.requiredConditions).toContain('belgisch')
    expect(ondernemingsnummer?.isRequired).toBe(false)

    const btwNummer = childByLabel.get('BTW-nummer')
    expect(btwNummer).toBeDefined()
    expect(btwNummer?.requiredConditions).toContain('buitenlands')
  })

  it('deduplicates shared children across variants', () => {
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

    let nestedFields = compositeBuilder.buildNestedStructure(allFields)
    const mergedFields = compositeBuilder.mergeRelatedGroups(nestedFields)

    const mergedGroup = mergedFields.find(f => !Array.isArray(f.isPartOf) || f.isPartOf.length === 0)
    expect(mergedGroup).toBeDefined()
    expect(mergedGroup?.children!.length).toBe(3) // Naam + Ondernemingsnummer + BTW-nummer (deduped)

    // Shared child "Naam" should have appearances from both variants
    const naamChild = mergedGroup!.children!.find(c => c.label === 'Naam')
    expect(naamChild).toBeDefined()
    expect(naamChild?.appearances).toHaveLength(2)
    // Since not required in ALL appearances, it should NOT be always-required
    expect(naamChild?.isRequired).toBe(false)
    expect(naamChild?.requiredConditions).toEqual([])
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
    const cond: ConditionalValidatorGenerator['generateAllConditionals'].prototype extends never ? never : any = null
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
