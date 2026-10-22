/**
 * @file Tests for the CURIE → URI expansion used by the hover tooltips.
 *
 * The prefix map is the POC's own prefixes (`vocab.ts`) plus the prefixes
 * declared in the Turtle document, so these tests also guard that the parser
 * keeps capturing them in `CodelistResult.prefixes`.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { CodelistResult } from '../models/index.js'
import { parseCodelist } from './codelist-parse.js'
import { expandUri } from './uri.js'

const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../public/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.ttl',
)

let result: CodelistResult

beforeAll(() => {
  const turtle = readFileSync(FIXTURE_PATH, 'utf-8')
  result = parseCodelist(turtle, true)
})

describe('CodelistResult.prefixes', () => {
  it('bevat de eigen prefixen plus de prefixen van het document', () => {
    expect(Object.keys(result.prefixes).length).toBeGreaterThan(10)
    expect(result.prefixes['conceptscheme']).toBe('https://data.omgeving.vlaanderen.be/id/conceptscheme/riepr/')
    expect(result.prefixes['lucht']).toBe('https://data.omgeving.vlaanderen.be/id/concept/riepr/operationeel-lucht/')
  })
})

describe('expandUri', () => {
  it('expandeert een operationeel veld naar de gepubliceerde URI', () => {
    expect(expandUri(result, 'lucht:brandstof')).toBe(
      'https://data.omgeving.vlaanderen.be/id/concept/riepr/operationeel-lucht/brandstof',
    )
  })

  it('expandeert een operationeel conceptscheme (stap) naar de gepubliceerde URI', () => {
    expect(expandUri(result, 'conceptscheme:operationeel_lucht_bron')).toBe(
      'https://data.omgeving.vlaanderen.be/id/conceptscheme/riepr/operationeel_lucht_bron',
    )
  })

  it('expandeert een thema-type scheme naar de gepubliceerde URI', () => {
    expect(expandUri(result, 'conceptscheme:thema_type')).toBe(
      'https://data.omgeving.vlaanderen.be/id/conceptscheme/riepr/thema_type',
    )
  })

  it('laat een absolute URI ongewijzigd door', () => {
    const uri = 'https://data.omgeving.vlaanderen.be/id/concept/riepr/operationeel-lucht/brandstof'
    expect(expandUri(result, uri)).toBe(uri)
  })

  it('geeft undefined voor een onbekende prefix', () => {
    expect(expandUri(result, 'onbekend:iets')).toBeUndefined()
  })

  it('geeft undefined voor een lege id', () => {
    expect(expandUri(result, '')).toBeUndefined()
  })
})
