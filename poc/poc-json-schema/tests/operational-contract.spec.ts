import { describe, expect, it } from 'vitest'
import { SchemaValidator } from '../src/services/schema-validator.js'
import { SemanticValidator } from '../src/services/semantic-validator.js'
import { ConceptMapper } from '../src/services/concept-mapper.js'
import { SchemaAssembler } from '../src/services/schema-assembler.js'
import {
  operationalCases, operationalResult, reportingSection, property, items,
  emissionCase, normalWaterCase, abnormalWaterCase, waterSelfControlCase,
} from './operational-fixtures.js'

const sosa = 'http://www.w3.org/ns/sosa/'
const qudt = 'http://qudt.org/schema/qudt/'
const riepr = 'https://data.riepr.omgeving.vlaanderen.be/ns/riepr#'
const unit = 'https://data.omgeving.vlaanderen.be/id/concept/csor/eenheid/'

describe('Current approved operational Resultaat source contracts', () => {
  it.each(operationalCases)('validates $id structurally and semantically offline', testCase => {
    expect(new SchemaValidator().validateInstance(testCase.schema, testCase.data)).toEqual({ valid: true, errors: [] })
    expect(new SemanticValidator().validate(testCase.schema, testCase.data, { references: testCase.references })).toEqual([])
  })

  it('keeps fuel as three independent member observations with local or explicitly undeclared units', () => {
    const schema = reportingSection('Lucht', 'lucht:brandstof')
    expect(Object.keys(schema.properties!)).toEqual(['featureEp', 'featureBron', 'brandstof'])
    const record = items(property(schema, 'brandstof'))
    for (const name of ['brandstofS', 'brandstofAs', 'brandstofVerbruik']) {
      const member = property(record, name)
      expect(member['x-jsonld-id']).toBe(sosa + 'hasMember')
      expect(property(member, 'hasResult')['x-jsonld-type']).toBe(riepr + 'Resultaat')
    }
    expect(property(property(record, 'brandstofS'), 'hasResult').properties?.hasUnit).toBeUndefined()
    expect(property(property(property(record, 'brandstofVerbruik'), 'hasResult'), 'hasUnit').const).toBe(unit + 'E_89')
  })

  it('makes air emissions reachable and keeps parameter values, deviation and variable scope inside the correct result', () => {
    const { schema } = emissionCase()
    const member = items(property(items(property(schema, 'emissie')), 'emissieParameter'))
    const result = property(member, 'hasResult')
    expect(member['x-jsonld-id']).toBe(sosa + 'hasMember')
    expect(property(member, 'observedProperty')['x-jsonld-id']).toBe(sosa + 'observedProperty')
    expect(property(result, 'numericValue').type).toBe('number')
    expect(property(result, 'numericValue')['x-variable-location']).toEqual({ ancestorDepth: 1, path: ['observedProperty'] })
    expect(property(result, 'hasUnit').const).toBe(unit + 'E_13')
    expect(property(property(result, 'additionalProperty'), 'unitCode').const).toBe(unit + 'E_43')
    expect(property(result, 'accrualPeriodicity').enum).toHaveLength(1)
  })

  it('preserves normal-water collections, four member observations and one shared Procedure', () => {
    const { schema, data } = normalWaterCase()
    const record = items(property(schema, 'lozing'))
    expect(record['x-jsonld-type']).toBe(riepr + 'ObservatieVerzameling')
    expect(record.properties?.observedProperty).toBeUndefined()
    for (const name of ['lozingDebiet', 'lozingDagen', 'lozingConcentratie', 'lozingJaarvracht']) {
      expect(property(record, name)['x-jsonld-id']).toBe(sosa + 'hasMember')
    }
    expect(property(record, 'lozingConcentratie')['x-variable-location']).toEqual({
      ancestorDepth: 0, path: ['additionalProperty', 'value'],
    })
    expect(property(record, 'usedProcedure')['x-jsonld-type']).toBe(sosa + 'Procedure')
    data.lozing[0].lozingDagen.hasResult.numericValue = 1.5
    expect(new SchemaValidator().validateInstance(schema, data).valid).toBe(false)
  })

  it('does not combine duration units with abnormal-water annual-load units or hoist result fields', () => {
    const { schema, data } = abnormalWaterCase()
    const record = items(property(schema, 'abnormaleLozing'))
    const result = property(record, 'hasResult')
    expect(record.properties?.numericValue).toBeUndefined()
    expect(property(result, 'numericValue')['x-jsonld-id']).toBe(qudt + 'numericValue')
    expect(property(result, 'hasUnit').const).toBe(unit + 'E_12')
    expect(property(property(result, 'additionalProperty'), 'unitCode').const).toBe(unit + 'E_94')
    data.abnormaleLozing[0].hasResult.additionalProperty.unitCode = unit + 'E_12'
    expect(new SchemaValidator().validateInstance(schema, data).valid).toBe(false)
  })

  it('owns water lab and parameter rows under each measurement, with textual sample kind inside Resultaat', () => {
    const { schema, data } = waterSelfControlCase()
    const record = items(property(schema, 'meting'))
    expect(schema.properties?.madeBySensor).toBeUndefined()
    const member = items(property(record, 'hasMember'))
    const result = property(member, 'hasResult')
    expect(property(property(result, 'parameterSoort'), 'value').type).toBe('string')
    expect(property(result, 'numericValue')['x-variable-location']).toEqual({ ancestorDepth: 1, path: ['observedProperty'] })
    expect(property(property(result, 'parameterMeetonzekerheid'), 'unitCode').const).toBe(unit + 'E_43')
    expect(property(result, 'hasUnit').const).toBe(unit + 'E_1')
    data.meting[0].hasMember[0].hasResult.hasUnit = unit + 'E_43'
    expect(new SchemaValidator().validateInstance(schema, data).valid).toBe(false)
  })

  it('compiles the existing isolated contextual integer production Observation without inventing a reachable flow', () => {
    const mapper = new ConceptMapper(operationalResult)
    const field = mapper.mapConcept(operationalResult.concepts.get('contextueel:productievolume')!)!
    const chain = {
      themeConcept: { id: 'x:isolated-source-check', prefLabel: 'Isolated source check' },
      schemeIds: [], structuralChains: new Map<string, string>(), leafSchemeId: '',
    }
    const { domainSchema } = new SchemaAssembler({}).assemble('Isolated source check', [field], null, chain, operationalResult)
    const result = property(property(domainSchema, 'productievolume'), 'hasResult')
    expect(result['x-jsonld-type']).toBe(riepr + 'Resultaat')
    expect(property(result, 'numericValue').type).toBe('integer')
    expect(result.properties?.hasUnit).toBeUndefined()
    const observation = property(domainSchema, 'productievolume')
    const instance = (numericValue: number) => ({
      productievolume: { observedProperty: property(observation, 'observedProperty').const, hasResult: { numericValue } },
    })
    expect(new SchemaValidator().validateInstance(domainSchema, instance(0)).valid).toBe(true)
    expect(new SchemaValidator().validateInstance(domainSchema, instance(1.25)).valid).toBe(false)
    for (const id of ['contextueel:energieverbruik', 'contextueel:waterverbruik', 'contextueel:grondstoffenverbruik']) {
      const concept = operationalResult.concepts.get(id)
      expect(concept, `Expected contextual stub ${id}`).toBeDefined()
      expect(() => mapper.mapConcept(concept!)).toThrow(/Missing or unsupported datatype/)
    }
  })

  it.each([
    ['Lucht', 'lucht:verbruikte_stof'],
    ['Lucht', 'lucht:geproduceerde_stof'],
    ['Lucht', 'lucht:afvalproduct'],
    ['Zelfcontrole lucht', 'zelfcontrole-lucht:meting'],
    ['Grondstoffen', 'grondstoffen:grondstof'],
  ])('explicitly blocks unresolved units in %s / %s', (theme, id) => {
    expect(() => reportingSection(theme, id)).toThrow(/Unresolved unit references/)
  })

  it('keeps the approved temporary material-code list empty and refuses to invent choices', () => {
    const mapper = new ConceptMapper(operationalResult)
    expect(() => mapper.mapConcept(operationalResult.concepts.get('grondstoffen:grondstof_materiaalcode')!))
      .toThrow('Scheme "conceptscheme:operationeel_materiaalcodes" has no top concepts')
  })

  it('retains all four actual material destination variants and their nested-result trigger without merging identities', () => {
    const mapper = new ConceptMapper(operationalResult)
    const variants = [...operationalResult.concepts.values()].filter(concept =>
      concept.broaderPartitive?.includes('grondstoffen:grondstof') && concept.related?.length,
    )
    expect(variants).toHaveLength(4)
    for (const variant of variants) {
      const field = mapper.mapConcept(variant)!
      expect(field.condition?.path).toBe('grondstoffen:grondstof_bestemming_type')
      expect(field.relevantClass).toBe('http://www.w3.org/ns/prov#Agent')
      expect(field.isRepeatable).toBe(false)
      expect(field.extensions?.['x-related-concepts']).toHaveLength(3)
      expect(field.extensions?.['x-source-concept']).toBe(operationalResult.expandCurie!(variant.id))
    }
    expect(operationalResult.concepts.get('grondstoffen:grondstof_bestemming_type')?.broaderPartitive)
      .toEqual(['grondstoffen:grondstof_resultaat'])
  })
})
