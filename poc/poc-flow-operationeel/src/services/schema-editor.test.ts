// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { JsonSchemaObject } from 'codelijst-rie-iepr-poc-json-schema/browser'
import { SchemaEditor } from './schema-editor.js'
import {
  reportingSection, operationalCases,
} from '../../../poc-json-schema/tests/operational-fixtures.js'

const value: JsonSchemaObject = {
  type: 'object', 'x-source-concept': 'urn:trigger', 'x-value-path': ['value'],
  properties: { propertyID: { const: 'urn:trigger' }, value: { type: 'boolean' } },
}
const conditional: JsonSchemaObject = {
  type: 'object', 'x-visible-when': { sourceConcept: 'urn:trigger', values: [true] },
  properties: { propertyID: { const: 'urn:detail' }, value: { type: 'number' } },
}
const fixture: JsonSchemaObject = {
  $id: 'https://example.test/editor', type: 'object', additionalProperties: false,
  properties: {
    records: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, properties: {
          trigger: value, detail: conditional,
          children: {
            type: 'array', items: {
              type: 'object', properties: {
                ancestorDetail: { type: 'string', 'x-visible-when': { sourceConcept: 'urn:trigger', values: [true] } },
                name: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
}

describe('Schema-driven draft editing and conditional projection', () => {
  it('keeps wrapped conditions row-scoped, including missing triggers, false values and ancestor contexts', () => {
    const editor = new SchemaEditor(fixture)
    editor.add(['records'], editor.schemaAt(['records']))
    editor.add(['records'], editor.schemaAt(['records']))
    editor.set(['records', 0, 'trigger', 'value'], true)
    editor.set(['records', 1, 'trigger', 'value'], false)
    editor.set(['records', 0, 'detail', 'value'], 0)
    editor.set(['records', 1, 'detail', 'value'], 42)
    editor.add(['records', 0, 'children'], editor.schemaAt(['records', 0, 'children']))
    editor.set(['records', 0, 'children', 0, 'ancestorDetail'], 'child')
    expect(editor.isActive(['records', 0, 'detail', 'value'])).toBe(true)
    expect(editor.isActive(['records', 1, 'detail', 'value'])).toBe(false)
    expect(editor.isActive(['records', 0, 'children', 0, 'ancestorDetail'])).toBe(true)
    expect(editor.project()).toEqual({
      records: [
        { trigger: { propertyID: 'urn:trigger', value: true }, detail: { propertyID: 'urn:detail', value: 0 }, children: [{ ancestorDetail: 'child' }] },
        { trigger: { propertyID: 'urn:trigger', value: false } },
      ],
    })
    editor.set(['records', 0, 'trigger', 'value'], undefined)
    expect(editor.isActive(['records', 0, 'detail'])).toBe(false)
    expect(editor.project()).toEqual({ records: [{ children: [{}] }, { trigger: { propertyID: 'urn:trigger', value: false } }] })
    expect(editor.get(['records', 0, 'detail', 'value'])).toBe(0)
    editor.set(['records', 0, 'trigger', 'value'], true)
    expect(editor.project().records).toMatchObject([{ detail: { value: 0 } }, {}])
  })

  it('keeps nested children on the correct owner when adding/removing parent and child rows', () => {
    const editor = new SchemaEditor(fixture)
    for (let index = 0; index < 3; index++) {
      editor.add(['records'], editor.schemaAt(['records']))
      editor.add(['records', index, 'children'], editor.schemaAt(['records', index, 'children']))
      editor.set(['records', index, 'children', 0, 'name'], `child-${index}`)
    }
    editor.remove(['records'], 1)
    expect(editor.project()).toEqual({ records: [{ children: [{ name: 'child-0' }] }, { children: [{ name: 'child-2' }] }] })
    editor.add(['records', 1, 'children'], editor.schemaAt(['records', 1, 'children']))
    editor.set(['records', 1, 'children', 1, 'name'], 'another')
    editor.remove(['records', 1, 'children'], 0)
    expect(editor.project()).toEqual({ records: [{ children: [{ name: 'child-0' }] }, { children: [{ name: 'another' }] }] })
  })

  it('preserves independent multiselect arrays directly instead of generating link IDs', () => {
    const editor = new SchemaEditor({
      type: 'object', properties: {
        choices: { type: 'array', items: { type: 'string', enum: ['urn:a', 'urn:b'] } },
      },
    })
    editor.set(['choices'], ['urn:a', 'urn:b'])
    expect(editor.project()).toEqual({ choices: ['urn:a', 'urn:b'] })
    expect(editor.validate().diagnostics).toEqual([])
  })

  it('does not materialize untouched optional constant-only PropertyValues', () => {
    const editor = new SchemaEditor(reportingSection('Grondwater', 'grondwater:peilmeting'))
    editor.add(['peilmeting'], editor.schemaAt(['peilmeting']))
    editor.set(['peilmeting', 0, 'hasResult', 'numericValue'], 0)
    const output = editor.project()
    expect(output).toMatchObject({ peilmeting: [{ hasResult: { numericValue: 0 } }] })
    expect(JSON.stringify(output)).not.toContain('additionalProperty')
    expect(JSON.stringify(output)).not.toContain('pomptoestand')
    expect(editor.validate().diagnostics).not.toEqual([])
  })

  it.each(operationalCases)('validates current $id data without changing typed values or nested ownership', testCase => {
    const editor = new SchemaEditor(testCase.schema, [], testCase.references)
    for (const [key, value] of Object.entries(testCase.data)) editor.set([key], structuredClone(value))
    const result = editor.validate()
    expect(result.diagnostics).toEqual([])
    expect(result.data).toEqual(testCase.data)
  })

  it('retains invalid active values as diagnostics rather than coercing them or returning success JSON', () => {
    const editor = new SchemaEditor({
      type: 'object', required: ['integer', 'date', 'choice'],
      properties: {
        integer: { type: 'integer', minimum: 0, maximum: 10 },
        date: { type: 'string', format: 'date' },
        choice: { type: 'string', enum: ['urn:allowed'] },
      },
    })
    editor.set(['integer'], 1.5)
    editor.set(['date'], 'not-a-date')
    editor.set(['choice'], 'urn:wrong')
    expect(editor.validate().diagnostics.map(error => error.instancePath)).toEqual(['/integer', '/date', '/choice'])
    editor.set(['integer'], 0)
    editor.set(['date'], '2026-11-05')
    editor.set(['choice'], 'urn:allowed')
    expect(editor.validate().diagnostics).toEqual([])
  })

  it('rejects unknown structural references even when they are strings with a valid URI', () => {
    const editor = new SchemaEditor({
      type: 'object', properties: { feature: { type: 'string', format: 'uri', 'x-reference-types': ['urn:filter'] } },
    })
    editor.set(['feature'], 'urn:unknown')
    expect(editor.validate().diagnostics).toMatchObject([{ instancePath: '/feature' }])
  })

  it('resolves sibling conditional values and never guesses through an independent repeated selector', () => {
    const editor = new SchemaEditor({
      type: 'object', properties: {
        context: { type: 'object', properties: { trigger: value } },
        rows: { type: 'array', items: { type: 'object', properties: { detail: conditional } } },
      },
    })
    editor.set(['context', 'trigger', 'value'], true)
    editor.set(['rows'], [{ detail: { value: 2 } }])
    expect(editor.isActive(['rows', 0, 'detail'])).toBe(true)
    editor.set(['context', 'trigger', 'value'], false)
    expect(editor.project()).toEqual({ context: { trigger: { propertyID: 'urn:trigger', value: false } }, rows: [{}] })
  })
})
