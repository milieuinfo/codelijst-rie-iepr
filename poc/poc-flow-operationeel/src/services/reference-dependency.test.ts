// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { JsonSchemaObject } from 'codelijst-rie-iepr-poc-json-schema/browser'
import { SchemaEditor } from './schema-editor.js'

const relation = 'urn:connectedTo'
const references = [
  { id: 'urn:p1', label: 'Point 1', types: ['urn:point'] },
  { id: 'urn:p2', label: 'Point 2', types: ['urn:point'] },
  { id: 'urn:s1', label: 'Source 1', types: ['urn:source'], relations: { [relation]: ['urn:p1'] } },
  { id: 'urn:s2', label: 'Source 2', types: ['urn:source'], relations: { [relation]: ['urn:p2'] } },
]
const schema: JsonSchemaObject = {
  $id: 'https://example.test/dependencies', type: 'object', additionalProperties: false,
  properties: { rows: { type: 'array', items: {
    type: 'object', additionalProperties: false, properties: {
      point: { type: 'string', 'x-source-concept': 'urn:point-field', 'x-reference-types': ['urn:point'] },
      sources: { type: 'array', items: {
        type: 'string', 'x-reference-types': ['urn:source'],
        'x-reference-dependency': { sourceConcept: 'urn:point-field', relation },
      } },
    },
  } } },
}

describe('Dependent structural selections in flat rows', () => {
  it('filters choices using the actual row and retains invalid drafts after changing its parent', () => {
    const editor = new SchemaEditor(schema, [], references)
    editor.set(['rows'], [{ point: 'urn:p1', sources: ['urn:s1'] }, { point: 'urn:p2' }, {}])
    const choices = ['urn:s1', 'urn:s2']
    expect(editor.referenceChoices(['rows', 0, 'sources'], choices)).toEqual(['urn:s1'])
    expect(editor.referenceChoices(['rows', 1, 'sources'], choices)).toEqual(['urn:s2'])
    expect(editor.referenceChoices(['rows', 2, 'sources'], choices)).toEqual([])
    expect(editor.validate().diagnostics).toEqual([])
    editor.set(['rows', 0, 'point'], 'urn:p2')
    expect(editor.referenceChoices(['rows', 0, 'sources'], choices)).toEqual(['urn:s2'])
    expect(editor.get(['rows', 0, 'sources'])).toEqual(['urn:s1'])
    expect(editor.validate().diagnostics.some(error => error.instancePath === '/rows/0/sources/0')).toBe(true)
  })
})
