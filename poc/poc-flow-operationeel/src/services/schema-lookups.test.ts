// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { JsonSchemaObject } from 'codelijst-rie-iepr-poc-json-schema/browser'
import { parseCodelist } from './codelist-parse.js'
import { SchemaLookups } from './schema-lookups.js'
import demonstrationReferences from '../../../poc-json-schema/examples/refs.json'

const result = () => parseCodelist(readFileSync(new URL(
  '../../../../src/main/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.ttl', import.meta.url,
), 'utf8'), true)
const installation = 'https://data.riepr.omgeving.vlaanderen.be/ns/riepr#Installatie'
const schema: JsonSchemaObject = {
  type: 'object', properties: {
    installation: { type: 'string', 'x-reference-types': [installation] },
  },
}

describe('Shared demonstration references', () => {
  it.each([2024, 2026])('preserves shared identities, labels and types for reporting year %s', year => {
    const lookups = new SchemaLookups(result())
    const references = lookups.references(schema, [], year)
    expect(references).toEqual(demonstrationReferences.filter(reference => reference.types.includes(installation))
      .map(reference => ({ ...reference, year })))
    expect(references.map(reference => reference.label)).toContain('GLASOVEN')
    for (const reference of references) expect(lookups.label(reference.id)).toBe(reference.label)
  })

  it('reports missing demonstration data rather than inventing UI-only options', () => {
    const lookups = new SchemaLookups(result())
    expect(() => lookups.references({
      type: 'string', 'x-reference-types': ['urn:missing:structural-type'],
    }, [], 2024)).toThrow('Geen gedeelde demonstratiegegevens')
  })

  it('accepts available alternatives without requiring examples for every permitted type', () => {
    const lookups = new SchemaLookups(result())
    const references = lookups.references({
      type: 'string', 'x-reference-types': [installation, 'urn:missing:alternative'],
    }, [], 2024)
    expect(references).toEqual(demonstrationReferences.filter(reference => reference.types.includes(installation)))
    expect(() => lookups.references({
      type: 'object', properties: {
        installation: schema.properties!.installation,
        other: { type: 'string', 'x-reference-types': ['urn:missing:independent-field'] },
      },
    }, [], 2024)).toThrow('Geen gedeelde demonstratiegegevens')
  })
})
