import type { JsonSchemaObject } from '../models/index.js'
import { config } from '../config.js'
import { homogeneousProperties } from './schema-assembler.js'

const sosa = 'http://www.w3.org/ns/sosa/'

export class BaseSchemaGenerator {
  generate(): JsonSchemaObject {
    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: `${config.baseSchemaUrl}/observatie.json`,
      title: 'Observatie',
      type: 'object',
      'x-jsonld-type': sosa + 'Observation',
      properties: this.sharedProperties(),
      not: { required: ['hasMember'] },
    }
  }

  generateCollection(): JsonSchemaObject {
    const observation = this.generate()
    delete observation.$id
    delete observation.$schema
    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: `${config.baseSchemaUrl.replace(/observatie$/, 'observatie-verzameling')}/observatie-verzameling.json`,
      title: 'Observatieverzameling',
      type: 'object',
      'x-jsonld-type': sosa + 'ObservationCollection',
      'x-semantic-profile': 'https://www.w3.org/TR/2020/WD-vocab-ssn-ext-20200116/',
      required: ['hasMember'],
      properties: {
        ...this.sharedProperties(),
        hasMember: {
          type: 'array', minItems: 1, title: 'Observaties',
          'x-jsonld-id': sosa + 'hasMember',
          items: { anyOf: [{ $ref: '#/$defs/observation' }, { $ref: '#' }] },
        },
      },
      not: { anyOf: [{ required: ['hasResult'] }, { required: ['hasSimpleResult'] }] },
      $defs: { observation },
    }
  }

  private sharedProperties(): Record<string, JsonSchemaObject> {
    return Object.fromEntries(homogeneousProperties.map(iri => {
      const name = iri.slice(sosa.length)
      const temporal = name === 'resultTime' || name === 'phenomenonTime'
      return [name, {
        'x-jsonld-id': iri,
        ...(temporal ? {
          anyOf: [
            { type: 'string', format: 'date-time' },
            { type: 'string', format: 'date' },
            {
              type: 'object', required: ['start', 'end'], additionalProperties: false,
              properties: { start: { type: 'string' }, end: { type: 'string' } },
              anyOf: ['date', 'date-time'].map(format => ({ properties: { start: { format }, end: { format } } })),
            },
          ],
        } : {
          anyOf: [{ type: 'string', format: 'uri' }, { type: 'object' }],
          'x-jsonld-type': '@id',
        }),
      }]
    }))
  }
}
