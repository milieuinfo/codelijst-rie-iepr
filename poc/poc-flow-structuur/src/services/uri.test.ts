/**
 * @file Tests for the CURIE → URI expansion used by the hover tooltips.
 *
 * The prefix map comes from the `@context` of the real rie-iepr.jsonld, so
 * these tests also guard that the parser keeps capturing it.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { CodelistResult } from '../models/index.js'
import { parseCodelist } from './codelist-parse.js'
import { expandUri } from './uri.js'

const JSONLD = resolve(
  __dirname,
  '../../public/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld',
)

let result: CodelistResult

beforeAll(() => {
  const data = JSON.parse(readFileSync(JSONLD, 'utf8')) as Record<string, unknown>
  result = parseCodelist(data)
})

describe('extractPrefixes / CodelistResult.prefixes', () => {
  it('vat de prefixen van het @context op', () => {
    expect(Object.keys(result.prefixes).length).toBeGreaterThan(10)
    expect(result.prefixes['conceptscheme']).toBe('https://data.omgeving.vlaanderen.be/id/conceptscheme/riepr/')
  })
})

describe('expandUri', () => {
  it('expandeert een installatie type naar de gepubliceerde URI', () => {
    expect(expandUri(result, 'installatie:fakkel')).toBe(
      'https://data.omgeving.vlaanderen.be/id/concept/riepr/installatie-type/fakkel',
    )
  })

  it('expandeert een installatie eigenschap naar de gepubliceerde URI', () => {
    expect(expandUri(result, 'installatie-eigenschappen:verwijderingsrendement')).toBe(
      'https://data.omgeving.vlaanderen.be/id/concept/riepr/installatie-eigenschappen/verwijderingsrendement',
    )
  })

  it('expandeert een conceptscheme naar de gepubliceerde URI', () => {
    expect(expandUri(result, 'conceptscheme:installatie_type')).toBe(
      'https://data.omgeving.vlaanderen.be/id/conceptscheme/riepr/installatie_type',
    )
  })

  it('laat een absolute URI ongewijzigd door', () => {
    const uri = 'https://data.omgeving.vlaanderen.be/id/concept/riepr/installatie-type/fakkel'
    expect(expandUri(result, uri)).toBe(uri)
  })

  it('geeft undefined voor een onbekende prefix', () => {
    expect(expandUri(result, 'systeemveld:riepr:label')).toBeUndefined()
  })

  it('geeft undefined voor een lege id', () => {
    expect(expandUri(result, '')).toBeUndefined()
  })
})
