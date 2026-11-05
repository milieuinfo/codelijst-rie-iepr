import { describe, it, expect } from 'vitest'
import { CodelistParser } from '../src/services/codelist-parser.js'
import { ConceptMapper } from '../src/services/concept-mapper.js'
import type { CodelistResult, Concept, SchemaField } from '../src/models/index.js'

describe('CodelistParser UI ordering annotations', () => {
  function buildFixture(concepts: Record<string, Record<string, unknown>>): Record<string, unknown> {
    const nodes: Record<string, unknown>[] = []
    for (const [id, fields] of Object.entries(concepts)) {
      nodes.push({ id, _type: ['skos:Concept'], ...fields })
    }
    return {
      '@context': { skos: 'http://www.w3.org/2004/02/skos/core#' },
      graph: nodes,
    }
  }

  it('parses _ui_first: "true" as boolean true', () => {
    const data = buildFixture({
      'x:first': { prefLabel: 'First', _ui_first: 'true' },
    })
    const result = new CodelistParser().parseData(data)
    expect(result.concepts.get('x:first')?.uiFirst).toBe(true)
  })

  it('parses _ui_first: "false" as boolean false', () => {
    const data = buildFixture({
      'x:notfirst': { prefLabel: 'Not First', _ui_first: 'false' },
    })
    const result = new CodelistParser().parseData(data)
    expect(result.concepts.get('x:notfirst')?.uiFirst).toBe(false)
  })

  it('parses _ui_after as bare string CURIE', () => {
    const data = buildFixture({
      'x:after': { prefLabel: 'After', _ui_after: 'x:before' },
    })
    const result = new CodelistParser().parseData(data)
    expect(result.concepts.get('x:after')?.uiAfter).toBe('x:before')
  })

  it('parses _ui_after as embedded node object with id field', () => {
    const data = buildFixture({
      'x:after2': { prefLabel: 'After Two', _ui_after: { id: 'x:before2', _type: ['skos:Concept'] } },
    })
    const result = new CodelistParser().parseData(data)
    expect(result.concepts.get('x:after2')?.uiAfter).toBe('x:before2')
  })

  it('leaves uiFirst and uiAfter undefined when keys are absent', () => {
    const data = buildFixture({
      'x:normal': { prefLabel: 'Normal Concept' },
    })
    const result = new CodelistParser().parseData(data)
    const concept = result.concepts.get('x:normal')
    expect(concept?.uiFirst).toBeUndefined()
    expect(concept?.uiAfter).toBeUndefined()
  })

  it('handles both _ui_first and _ui_after on the same concept', () => {
    const data = buildFixture({
      'x:paired': { prefLabel: 'Paired', _ui_first: 'true', _ui_after: 'x:other' },
    })
    const result = new CodelistParser().parseData(data)
    expect(result.concepts.get('x:paired')?.uiFirst).toBe(true)
    expect(result.concepts.get('x:paired')?.uiAfter).toBe('x:other')
  })
})

describe('ConceptMapper UI ordering propagation', () => {
  function makeFakeResult(): CodelistResult {
    return {
      nodesById: new Map(),
      schemes: new Map(),
      concepts: new Map(),
      topConcepts: new Map(),
      collections: new Map(),
    }
  }

  function makeFakeConcept(overrides: Partial<Concept> & Pick<Concept, 'id'>): Concept {
    return { id: 'test:id', prefLabel: 'Test', relevantDataType: 'xsd:string', ...overrides }
  }

  it('copies uiFirst=true onto SchemaField.uiFirst', () => {
    const result = makeFakeResult()
    const mapper = new ConceptMapper(result)
    const concept = makeFakeConcept({ uiFirst: true })
    const field = mapper.mapConcept(concept)
    expect(field).not.toBeNull()
    expect(field!.uiFirst).toBe(true)
    expect(field!.uiAfterConceptId).toBeUndefined()
  })

  it('copies uiAfter concept ID onto SchemaField.uiAfterConceptId', () => {
    const result = makeFakeResult()
    const mapper = new ConceptMapper(result)
    const concept = makeFakeConcept({ uiAfter: 'x:some-concept' })
    const field = mapper.mapConcept(concept)
    expect(field).not.toBeNull()
    expect(field!.uiAfterConceptId).toBe('x:some-concept')
    expect(field!.uiFirst).toBeUndefined()
  })

  it('maps both uiFirst and uiAfter on the same concept', () => {
    const result = makeFakeResult()
    const mapper = new ConceptMapper(result)
    const concept = makeFakeConcept({ uiFirst: true, uiAfter: 'x:another' })
    const field = mapper.mapConcept(concept)
    expect(field).not.toBeNull()
    expect(field!.uiFirst).toBe(true)
    expect(field!.uiAfterConceptId).toBe('x:another')
  })
})
