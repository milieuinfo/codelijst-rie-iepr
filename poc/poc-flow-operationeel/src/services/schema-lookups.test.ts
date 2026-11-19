// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { personalizeReferenceSchema, schemaObject, SemanticValidator, type JsonSchemaObject } from 'codelijst-rie-iepr-poc-json-schema/browser'
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

  it('offers process identities with system-identical names, filtered through their implementing systems', () => {
    const lookups = new SchemaLookups(result())
    const process = 'https://data.riepr.omgeving.vlaanderen.be/ns/riepr#Proces'
    const selection: JsonSchemaObject = {
      $id: 'https://example.test/installation-processes', type: 'object', properties: {
        installation: { type: 'string', 'x-reference-types': [process],
          'x-reference-via': { relation: 'http://www.w3.org/ns/ssn/implementedBy', types: [installation] } },
      },
    }
    const references = lookups.references(selection, [], 2026)
    const personal = personalizeReferenceSchema(selection, { references, referenceContext: { year: 2026 } })
    const choices = schemaObject(personal.properties!.installation).enum
    const systems = demonstrationReferences.filter(reference => reference.types.includes(installation))
    expect(choices).toHaveLength(systems.length)
    for (const system of systems) {
      const selected = references.find(reference => reference.relations?.['http://www.w3.org/ns/ssn/implementedBy']?.includes(system.id))!
      expect(choices).toContain(selected.id)
      expect(choices).not.toContain(system.id)
      expect(selected.types).toEqual([process])
      expect(selected.label).toBe(system.label)
      expect(lookups.label(selected.id)).toBe(system.label)
      expect(new SemanticValidator().validate(personal, { installation: selected.id })).toEqual([])
    }
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
