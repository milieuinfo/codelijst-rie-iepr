import { describe, expect, it } from 'vitest'
import { ThemeResolver } from '../src/services/theme-resolver.js'

const scheme = (id: string) => ({ id, _type: ['skos:ConceptScheme'] })

describe('Explicit reporting entries', () => {
  it('resolves each declared operational reporting entry', () => {
    const result = {
      reportingProfile: 'operational-csv-v1',
      reportingEntries: [
        { schemeId: 'scheme:air', slug: 'lucht', label: 'Lucht' },
        { schemeId: 'scheme:water', slug: 'water', label: 'Water' },
      ],
      schemes: new Map([['scheme:air', scheme('scheme:air')], ['scheme:water', scheme('scheme:water')]]),
      concepts: new Map(),
    } as never

    const themes = new ThemeResolver().resolveAllThemes(result)
    expect([...themes.keys()]).toEqual(['Lucht', 'Water'])
    expect(themes.get('Lucht')?.schemeIds).toEqual(['scheme:air'])
  })

  it('rejects missing and duplicate reporting entries', () => {
    const resolver = new ThemeResolver()
    const missing = {
      reportingProfile: 'operational-csv-v1',
      reportingEntries: [{ schemeId: 'scheme:missing', slug: 'missing', label: 'Missing' }],
      schemes: new Map(),
      concepts: new Map(),
    } as never
    expect(() => resolver.resolveAllThemes(missing)).toThrow('Missing reporting entry scheme')

    const duplicate = {
      reportingProfile: 'operational-csv-v1',
      reportingEntries: [
        { schemeId: 'scheme:air', slug: 'same', label: 'Lucht' },
        { schemeId: 'scheme:water', slug: 'same', label: 'Water' },
      ],
      schemes: new Map([['scheme:air', scheme('scheme:air')], ['scheme:water', scheme('scheme:water')]]),
      concepts: new Map(),
    } as never
    expect(() => resolver.resolveAllThemes(duplicate)).toThrow('Duplicate reporting entry')
  })
})
