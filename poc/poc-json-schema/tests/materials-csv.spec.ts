import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sourceSnapshot } from '../scripts/source-snapshot.mjs'
import { compileTheme } from './groundwater-csv-fixture.js'
import { SchemaValidator } from '../src/services/schema-validator.js'
import { SemanticValidator } from '../src/services/semantic-validator.js'
import { schemaObject } from '../src/services/schema-registry.js'

const load = (name: string) => JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'))
const compiled = compileTheme(JSON.parse(sourceSnapshot()), 'Grondstoffen')
const validator = new SchemaValidator()
const section = (name: string) => compiled.subSchemas.find(section => section.name === name)!.schema

describe('Raw-material CSV reporting contracts', () => {
  it.each([undefined, 'grondstoffen:inkomend'])('omits the production question from incoming reporting (selection: %s)', selected => {
    const schemas = compileTheme(JSON.parse(sourceSnapshot()), 'Grondstoffen', selected)
    const incoming = schemas.subSchemas.find(section => section.name === 'inkomend')!.schema
    expect(incoming.properties).not.toHaveProperty('geproduceerd')
    if (selected) expect(schemas.domainSchema.properties).not.toHaveProperty('geproduceerd')
    else {
      expect(schemas.domainSchema.properties).toHaveProperty('geproduceerd')
      expect(section('grondstof').properties).toHaveProperty('geproduceerd')
    }
  })

  it.each(['grondstof', 'inkomend'])('validates %s examples, optional absence and zero in ton', name => {
    const schema = section(name)
    const data = load(`grondstoffen/${name}`)
    expect(validator.validateInstance(schema, data).errors).toEqual([])
    expect(new SemanticValidator().validate(schema, data, {
      references: load('refs'), referenceContext: load('reference-context'),
    })).toEqual([])
    expect(validator.validateInstance(schema, {}).valid).toBe(true)
    data[name][0].hasResult.numericValue = -0.001
    expect(validator.validateInstance(schema, data).valid).toBe(false)
    data[name][0].hasResult.numericValue = 1
    data[name][0].hasResult.hasUnit = 'https://data.omgeving.vlaanderen.be/id/concept/csor/eenheid/E_95'
    expect(validator.validateInstance(schema, data).valid).toBe(false)
  })

  it('requires produced quantities, application, material and at least one destination only when production is true', () => {
    const schema = section('grondstof')
    for (const change of ['material', 'numericValue', 'additionalProperty', 'destinations', 'false', 'missing-flag']) {
      const data = load('grondstoffen/grondstof')
      if (change === 'destinations') data.grondstof[0].qualifiedAssociation = []
      else if (change === 'false') data.geproduceerd = false
      else if (change === 'missing-flag') delete data.geproduceerd
      else delete data.grondstof[0].hasResult[change]
      expect(validator.validateInstance(schema, data).valid, change).toBe(false)
    }
    expect(validator.validateInstance(schema, { geproduceerd: false }).valid).toBe(true)
    expect(validator.validateInstance(schema, { geproduceerd: true }).valid).toBe(false)
    const record = schemaObject(schemaObject(schema.properties!.grondstof).items)
    const result = schemaObject(record.properties!.hasResult)
    expect(schemaObject(result.properties!.material).enum).toHaveLength(137)
  })

  it('keeps destination identity requirements and rejects inactive destination branches', () => {
    const schema = section('grondstof')
    for (const [index, branch, field] of [
      [0, 'bestemmingsidentificatieBe', 'registration'],
      [0, 'bestemmingsidentificatieBe', 'identifier'],
      [1, 'bestemmingsidentificatieBuitenland', 'registration'],
      [3, 'bestemmingsidentificatieNone', 'label'],
      [3, 'bestemmingsidentificatieNone', 'address'],
    ] as const) {
      const data = load('grondstoffen/grondstof')
      delete data.grondstof[0].qualifiedAssociation[index][branch][field]
      expect(validator.validateInstance(schema, data).valid, `${branch}/${field}`).toBe(false)
    }
    const data = load('grondstoffen/grondstof')
    data.grondstof[0].qualifiedAssociation[0].bestemmingsidentificatieBuitenland = { registration: 'NL123' }
    expect(validator.validateInstance(schema, data).valid).toBe(false)
  })

  it('requires incoming installation, activity and nature, rejecting references of the wrong structural type', () => {
    const schema = section('inkomend')
    for (const field of ['hasFeatureOfInterest', 'subject', 'hasResult']) {
      const data = load('grondstoffen/inkomend')
      delete data.inkomend[0][field]
      expect(validator.validateInstance(schema, data).valid, field).toBe(false)
    }
    const data = load('grondstoffen/inkomend')
    delete data.inkomend[0].hasResult.comment
    expect(validator.validateInstance(schema, data).valid).toBe(false)
    const wrongType = load('grondstoffen/inkomend')
    wrongType.inkomend[0].hasFeatureOfInterest = 'urn:demo:installatie:1'
    expect(new SemanticValidator().validate(schema, wrongType, {
      references: load('refs'), referenceContext: load('reference-context'),
    }).length).toBeGreaterThan(0)
  })
})
