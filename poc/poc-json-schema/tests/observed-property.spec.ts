import { describe, expect, it } from 'vitest'
import { sourceSnapshot } from '../scripts/source-snapshot.mjs'
import { compileTheme } from './groundwater-csv-fixture.js'
import { CodelistParser } from '../src/services/codelist-parser.js'
import { schemaObject } from '../src/services/schema-registry.js'
import { memberVariants } from '../src/services/member-layout.js'
import { SchemaValidator } from '../src/services/schema-validator.js'

const cases = [
  ['Grondwater', 'kwaliteitsmeting', 'grondwater:kwaliteitsmeting-resultaten', 'grondwater:kwaliteitsmeting-resultaten-meetwaarde', 'grondwater:kwaliteitsmeting-resultaten-parameter'],
  ['Lucht', 'emissie', 'lucht:emissie_parameter', 'lucht:emissie_parameter_massastroom', 'lucht:emissie_parameter_parameter'],
  ['Water', 'abnormale-lozing', 'water:abnormale-lozing', 'water:abnormale-lozing-jaarvracht', 'water:abnormale-lozing-stof'],
  ['Zelfcontrole lucht', 'meting', 'zelfcontrole-lucht:parameter', 'zelfcontrole-lucht:parameter-concentratie', 'zelfcontrole-lucht:parameter-parameter'],
  ['Zelfcontrole water', 'meting', 'zelfcontrole-water:parameter', 'zelfcontrole-water:parameter-concentratie', 'zelfcontrole-water:parameter-parameter'],
] as const

describe('Source-declared measurement concepts instead of variable-valued observedProperty', () => {
  it.each(cases)('compiles %s/%s with a fixed measurement and a variable on Resultaat', (theme, section, observation, measurement, variable) => {
    const source = JSON.parse(sourceSnapshot())
    const expand = new CodelistParser().parseData(source).expandCurie!
    const schema = compileTheme(source, theme).subSchemas.find(item => item.name === section)!.schema
    const root = schemaObject(schemaObject(Object.values(schema.properties!)[0]).items)
    const owner = root['x-source-concept'] === expand(observation) ? root
      : memberVariants(root).find(item => item['x-source-concept'] === expand(observation))!
    expect(schemaObject(owner.properties!.observedProperty).const).toBe(expand(measurement))
    const result = schemaObject(owner.properties!.hasResult)
    const selector = schemaObject(schemaObject(result.properties!.additionalProperty).items).oneOf!.map(schemaObject)
      .find(item => schemaObject(item.properties!.propertyID).const === expand(variable))!
    expect(selector).toBeDefined()
    expect(schemaObject(selector.properties!.value)).toMatchObject({
      'x-jsonld-id': 'https://schema.org/value',
      'x-jsonld-type': '@id',
      enum: expect.arrayContaining([expect.stringContaining('/csor/variabele/')]),
    })
    expect(result.properties).toHaveProperty('numericValue')
    if (theme === 'Grondwater') {
      const additionalProperty = [{
        propertyID: expand(variable),
        value: schemaObject(selector.properties!.value).enum![0],
      }]
      const validator = new SchemaValidator()
      expect(validator.validateInstance(result, { additionalProperty }).valid).toBe(false)
      expect(validator.validateInstance(result, {
        additionalProperty, numericValue: 0, hasUnit: 'https://data.omgeving.vlaanderen.be/id/concept/csor/eenheid/E_1',
      }).valid).toBe(true)
    }
  })

  it('rejects a variable selector or a conflicting selector as the observed measurement', () => {
    const source = JSON.parse(sourceSnapshot())
    const owner = source.graph.find((node: { id: string }) => node.id === 'grondwater:kwaliteitsmeting-resultaten')
    owner.observedProperty = 'grondwater:kwaliteitsmeting-resultaten-parameter'
    expect(() => compileTheme(source, 'Grondwater')).toThrow(/not a variable selector/)
    owner.observedProperty = 'grondwater:kwaliteitsmeting-resultaten-meetwaarde'
    const variable = source.graph.find((node: { id: string }) => node.id === 'grondwater:kwaliteitsmeting-resultaten-parameter')
    variable.relation = 'sosa:observedProperty'
    delete variable.relevantClass
    expect(() => compileTheme(source, 'Grondwater')).toThrow(/not both/)
  })
})
