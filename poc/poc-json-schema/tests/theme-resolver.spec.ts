import { describe, expect, it } from 'vitest'
import { CodelistParser } from '../src/services/codelist-parser.js'
import { ThemeResolver } from '../src/services/theme-resolver.js'

const scheme = (id: string) => ({ id, _type: ['skos:ConceptScheme'] })
const concept = (id: string, inScheme: string, extra: Record<string, unknown> = {}) => ({
  id, _type: ['skos:Concept'], inScheme, prefLabel: id, ...extra,
})

function fixture(extra: Record<string, unknown>[] = []) {
  return {
    '@context': {
      skos: 'http://www.w3.org/2004/02/skos/core#',
      qb: 'http://purl.org/linked-data/cube#',
      vervolgstap: { '@id': 'qb:codeList', '@type': '@id' },
    },
    graph: [
      scheme('conceptscheme:thematypes'),
      concept('theme:first', 'conceptscheme:thematypes', { vervolgstap: 'step:first' }),
      scheme('step:first'),
      ...extra,
    ],
  }
}

describe('Explicit operational flow graph', () => {
  it('uses vervolgstap, including links on nested fields, without identifier guesses', () => {
    const data = fixture([
      concept('first:picker', 'step:first', { vervolgstap: 'step:details' }),
      scheme('step:details'),
      concept('first:part', 'step:details', { broaderPartitive: 'first:group', vervolgstap: 'step:leaf' }),
      scheme('step:leaf'),
      scheme('step:first_water'),
      concept('first_water:unrelated', 'step:first_water', { vervolgstap: 'step:unrelated' }),
      scheme('step:unrelated'),
    ])
    const result = new CodelistParser().parseData(data)
    const chain = new ThemeResolver().resolveTheme(result, 'theme:first')!
    expect(chain.schemeIds).toEqual(['step:first', 'step:details', 'step:leaf'])
    expect(chain.transitions).toEqual([
      { fromSchemeId: 'step:first', triggerConceptId: 'first:picker', toSchemeId: 'step:details' },
      { fromSchemeId: 'step:details', triggerConceptId: 'first:part', toSchemeId: 'step:leaf' },
    ])
  })

  it('retains all edges and leaves for branching and reconverging steps', () => {
    const result = new CodelistParser().parseData(fixture([
      concept('first:picker', 'step:first', { vervolgstap: ['step:a', 'step:b'] }),
      scheme('step:a'), scheme('step:b'), scheme('step:shared'),
      concept('a:next', 'step:a', { vervolgstap: 'step:shared' }),
      concept('b:next', 'step:b', { vervolgstap: 'step:shared' }),
    ]))
    const chain = new ThemeResolver().resolveTheme(result, 'theme:first')!
    expect(chain.schemeIds).toEqual(['step:first', 'step:a', 'step:shared', 'step:b'])
    expect(chain.transitions).toHaveLength(4)
    expect(chain.leafSchemeIds).toEqual(['step:shared'])
  })

  it('rejects cycles and unresolved next steps with context', () => {
    const parser = new CodelistParser()
    const cycle = parser.parseData(fixture([
      concept('first:next', 'step:first', { vervolgstap: 'step:second' }),
      scheme('step:second'),
      concept('second:back', 'step:second', { vervolgstap: 'step:first' }),
    ]))
    expect(() => new ThemeResolver().resolveAllThemes(cycle)).toThrow('step:first -> step:second -> step:first')
    const missing = parser.parseData(fixture([
      concept('first:next', 'step:first', { vervolgstap: 'step:missing' }),
    ]))
    expect(() => new ThemeResolver().resolveAllThemes(missing)).toThrow('Unresolved vervolgstap step:missing')
  })

  it('rejects stale seeAlso navigation instead of succeeding with no themes', () => {
    const data = fixture()
    data.graph[1] = concept('theme:first', 'conceptscheme:thematypes', { seeAlso: 'step:first' })
    expect(() => new ThemeResolver().resolveAllThemes(new CodelistParser().parseData(data)))
      .toThrow('sync the current codelist')
  })

  it('rejects missing entry schemes and duplicate theme labels', () => {
    const parser = new CodelistParser()
    expect(() => new ThemeResolver().resolveAllThemes(parser.parseData({ graph: [] })))
      .toThrow('Theme entry scheme not found')
    const duplicate = fixture([
      concept('theme:second', 'conceptscheme:thematypes', { prefLabel: 'theme:first', vervolgstap: 'step:first' }),
    ])
    expect(() => new ThemeResolver().resolveAllThemes(parser.parseData(duplicate))).toThrow('Duplicate theme label')
  })
})

describe('Navigation predicates are IRIs, not JSON-LD term names', () => {
  it('recognizes renamed terms and expanded predicates with expanded SKOS types', () => {
    const parser = new CodelistParser()
    const result = parser.parseData({
      '@context': {
        skos: 'http://www.w3.org/2004/02/skos/core#',
        nextScreen: { '@id': 'http://purl.org/linked-data/cube#codeList', '@type': '@id' },
        label: { '@id': 'skos:prefLabel' },
        belongs: { '@id': 'skos:inScheme', '@type': '@id' },
      },
      '@graph': [
        { '@id': 'conceptscheme:thematypes', '@type': 'http://www.w3.org/2004/02/skos/core#ConceptScheme' },
        {
          '@id': 'theme:first', '@type': 'skos:Concept',
          belongs: 'conceptscheme:thematypes', label: 'First',
          nextScreen: { '@id': 'step:first' },
        },
        scheme('step:first'),
        concept('first:next', 'step:first', { 'http://purl.org/linked-data/cube#codeList': 'step:second' }),
        scheme('step:second'),
      ],
    })
    expect(new ThemeResolver().resolveAllThemes(result).get('First')?.schemeIds)
      .toEqual(['step:first', 'step:second'])
  })

  it('does not trust a familiar term mapped to an unrelated IRI or leak context between parses', () => {
    const parser = new CodelistParser()
    const misleading = fixture()
    misleading['@context'].vervolgstap['@id'] = 'https://example.org/not-navigation'
    expect(() => new ThemeResolver().resolveAllThemes(parser.parseData(misleading)))
      .toThrow('has no vervolgstap')
    Object.assign(misleading['@context'], { vervolgstap: null })
    expect(() => new ThemeResolver().resolveAllThemes(parser.parseData(misleading)))
      .toThrow('has no vervolgstap')
    expect(new ThemeResolver().resolveAllThemes(parser.parseData(fixture())).size).toBe(1)
  })

  it('keeps expansion bound to the document that produced each result', () => {
    const parser = new CodelistParser()
    const first = parser.parseData({ '@context': { item: 'https://example.test/first/' }, graph: [] })
    parser.parseData({ '@context': { item: 'https://example.test/second/' }, graph: [] })
    expect(first.expandCurie?.('item:one')).toBe('https://example.test/first/one')
  })

  it('resolves an expanded theme entry identifier without identifier substring matching', () => {
    const data = fixture()
    Object.assign(data['@context'], { conceptscheme: 'https://example.test/schemes/' })
    data.graph[0] = scheme('https://example.test/schemes/thematypes')
    data.graph[1] = concept('theme:first', 'https://example.test/schemes/thematypes', { vervolgstap: 'step:first' })
    expect(new ThemeResolver().resolveAllThemes(new CodelistParser().parseData(data)).size).toBe(1)
  })
})
