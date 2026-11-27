// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { SchemaEditor } from './schema-editor.js'
import { CodelistParser } from '../../../poc-json-schema/src/services/codelist-parser.js'
import { ConceptMapper } from '../../../poc-json-schema/src/services/concept-mapper.js'
import { CompositeGroupBuilder } from '../../../poc-json-schema/src/services/composite-group-builder.js'
import { SchemaAssembler } from '../../../poc-json-schema/src/services/schema-assembler.js'

describe('Field validation messages', () => {
  it('explains missing and empty required hierarchical groups using their labels and row numbers', () => {
    const editor = new SchemaEditor({
      $id: 'https://example.test/groups', type: 'object',
      properties: {
        records: {
          type: 'array', title: 'Producten', 'x-source-concept': 'urn:products',
          items: {
            type: 'object', required: ['associations', 'optionalGroup'],
            properties: {
              associations: {
                type: 'array', title: 'Bestemmingen', 'x-source-concept': 'urn:destinations', minItems: 1,
                'x-validation-message': 'Voeg minstens één bestemming toe.',
                items: { type: 'object', properties: { name: { type: 'string' } } },
              },
              optionalGroup: {
                type: 'array', title: 'Bijlagen', 'x-source-concept': 'urn:attachments',
                items: { type: 'object', properties: { name: { type: 'string' } } },
              },
            },
          },
        },
      },
    })
    editor.set(['records'], [{ optionalGroup: [] }, { associations: [], optionalGroup: [] }])
    const errors = editor.validate().diagnostics
    expect(errors).toContainEqual({
      instancePath: '/records/0/associations', displayPath: 'Producten › rij 1 › Bestemmingen',
      message: 'Voeg minstens één bestemming toe.',
    })
    expect(errors).toContainEqual({
      instancePath: '/records/1/associations', displayPath: 'Producten › rij 2 › Bestemmingen',
      message: 'Voeg minstens één bestemming toe.',
    })
    expect(errors.filter(error => error.instancePath.endsWith('/optionalGroup'))).toEqual([])
    editor.set(['records', 0, 'associations'], [{ name: 'Eerste bestemming' }])
    expect(editor.validate().diagnostics.some(error => error.instancePath === '/records/0/associations')).toBe(false)
  })

  it('respects group cardinality and explicit messages, including in nested rows', () => {
    const editor = new SchemaEditor({
      $id: 'https://example.test/nested-groups', type: 'object',
      properties: {
        records: {
          type: 'array', title: 'Producten', 'x-source-concept': 'urn:products',
          items: {
            type: 'object',
            properties: {
              groups: {
                type: 'array', title: 'Groepen', 'x-source-concept': 'urn:groups',
                items: {
                  type: 'object', required: ['destinations', 'attachments', 'notes'],
                  properties: {
                    destinations: {
                      type: 'array', title: 'Bestemmingen', 'x-source-concept': 'urn:destinations', minItems: 2,
                      'x-validation-message': 'Voeg minstens 2 bestemmingen toe.',
                      items: { type: 'object', properties: { name: { type: 'string' } } },
                    },
                    attachments: {
                      type: 'array', title: 'Bijlagen', 'x-source-concept': 'urn:attachments',
                      'x-validation-message': 'Vul de bijlagen in.',
                      items: { type: 'object', properties: { name: { type: 'string' } } },
                    },
                    notes: {
                      type: 'array', title: 'Notities', 'x-source-concept': 'urn:notes', minItems: 1,
                      'x-validation-message': 'Voeg een toelichting toe.',
                      items: { type: 'object', properties: { name: { type: 'string' } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })
    editor.set(['records'], [{ groups: [{ destinations: [], notes: [] }] }])
    const errors = editor.validate().diagnostics
    expect(errors).toContainEqual({
      instancePath: '/records/0/groups/0/destinations',
      displayPath: 'Producten › rij 1 › Groepen › rij 1 › Bestemmingen',
      message: 'Voeg minstens 2 bestemmingen toe.',
    })
    expect(errors).toContainEqual({
      instancePath: '/records/0/groups/0/attachments',
      displayPath: 'Producten › rij 1 › Groepen › rij 1 › Bijlagen',
      message: 'Vul de bijlagen in.',
    })
    expect(errors).toContainEqual({
      instancePath: '/records/0/groups/0/notes',
      displayPath: 'Producten › rij 1 › Groepen › rij 1 › Notities',
      message: 'Voeg een toelichting toe.',
    })
  })

  it('uses messages for missing and invalid values without inheriting group messages', () => {
    const editor = new SchemaEditor({
      $id: 'https://example.test/validation', type: 'object', required: ['name', 'amount', 'choices'],
      properties: {
        name: { type: 'string', minLength: 1, 'x-validation-message': 'Vul een naam in.' },
        amount: {
          type: 'object', 'x-value-path': ['numericValue'], 'x-validation-message': 'Vul een geldig volume in.',
          required: ['numericValue'], properties: { numericValue: { type: 'number', minimum: 0 } },
        },
        choices: {
          type: 'array', minItems: 1, 'x-validation-message': 'Kies minstens één optie.',
          items: { type: 'string', enum: ['a'], 'x-validation-message': 'Kies een geldige optie.' },
        },
        group: {
          type: 'object', 'x-validation-message': 'Controleer de groep.',
          properties: { other: { type: 'integer' } },
        },
      },
    })
    editor.set(['amount', 'numericValue'], -1)
    editor.set(['choices'], [])
    editor.set(['group', 'other'], 'ongeldig')
    const errors = editor.validate().diagnostics
    expect(errors).toContainEqual({ instancePath: '/name', message: 'Vul een naam in.' })
    expect(errors).toContainEqual({ instancePath: '/amount/numericValue', message: 'Vul een geldig volume in.' })
    expect(errors).toContainEqual({ instancePath: '/choices', message: 'Kies minstens één optie.' })
    expect(errors.find(error => error.instancePath === '/group/other')?.message).not.toBe('Controleer de groep.')
    editor.set(['name'], 'Naam')
    editor.set(['choices'], ['niet-geldig'])
    expect(editor.validate().diagnostics).toContainEqual({ instancePath: '/choices/0', message: 'Kies een geldige optie.' })
    editor.set(['amount'], undefined)
    expect(editor.validate().diagnostics).toContainEqual({
      instancePath: '/amount/numericValue', message: 'Vul een geldig volume in.',
    })
  })

  it('uses the source note on a canonical repeated observation after presentation mapping', () => {
    const result = new CodelistParser().parseData({
      '@context': { x: 'https://example.test/concept/' },
      graph: [
        { id: 'x:report', _type: ['skos:Concept'], inScheme: 'x:section', prefLabel: 'Rapport',
          relevantClass: 'riepr:ObservatieVerzameling', isMeervoudig: true },
        { id: 'x:amount', _type: ['skos:Concept'], inScheme: 'x:section', prefLabel: 'Hoeveelheid',
          broaderPartitive: 'x:report', relevantClass: 'riepr:Observatie', relation: 'sosa:hasMember',
          relevantDataType: 'xsd:integer', minValue: '0', isVerplicht: true,
          note: 'Vul een niet-negatief geheel getal in.' },
      ],
    })
    const mapper = new ConceptMapper(result)
    const fields = new CompositeGroupBuilder(result, mapper).buildNestedStructure(
      [...result.concepts.values()].map(concept => mapper.mapConcept(concept)!),
    )
    const chain = { themeConcept: { id: 'x:theme', prefLabel: 'Test' },
      schemeIds: [], structuralChains: new Map<string, string>(), leafSchemeId: '' }
    const schema = new SchemaAssembler({}).assemble('Test', fields, null, chain, result).domainSchema
    const editor = new SchemaEditor(schema)
    editor.set(['report', 0, 'hasMember', 'hasResult', 'numericValue'], -1)
    expect(editor.validate().diagnostics).toContainEqual({
      instancePath: '/report/0/hasMember/hasResult/numericValue',
      message: 'Vul een niet-negatief geheel getal in.',
    })
    editor.set(['report', 0, 'hasMember'], undefined)
    expect(editor.validate().diagnostics).toContainEqual({
      instancePath: '/report/0/hasMember/hasResult/numericValue',
      message: 'Vul een niet-negatief geheel getal in.',
    })
  })

  it('uses the source note for a required repeatable group', () => {
      const result = new CodelistParser().parseData({
        '@context': { x: 'https://example.test/concept/' },
        graph: [
          { id: 'x:destinations', _type: ['skos:Concept'], inScheme: 'x:section', prefLabel: 'Bestemmingen',
            isMeervoudig: true, isVerplicht: true, note: 'Voeg minstens één bestemming toe.' },
          { id: 'x:name', _type: ['skos:Concept'], inScheme: 'x:section', prefLabel: 'Naam',
            broaderPartitive: 'x:destinations', relevantDataType: 'xsd:string' },
        ],
      })
      const mapper = new ConceptMapper(result)
      const fields = new CompositeGroupBuilder(result, mapper).buildNestedStructure(
        [...result.concepts.values()].map(concept => mapper.mapConcept(concept)!),
      )
      const chain = { themeConcept: { id: 'x:theme', prefLabel: 'Test' },
        schemeIds: [], structuralChains: new Map<string, string>(), leafSchemeId: '' }
      const schema = new SchemaAssembler({}).assemble('Test', fields, null, chain, result).domainSchema
      const editor = new SchemaEditor(schema)
      expect(editor.validate().diagnostics).toContainEqual({
        instancePath: '/destinations', displayPath: 'Bestemmingen', message: 'Voeg minstens één bestemming toe.',
    })
  })
})
