import { describe, it, expect } from 'vitest'
import { ConceptMapper } from '../src/services/concept-mapper.js'
import { operationalResult as result, reportingSection, property, items } from './operational-fixtures.js'

const CSOR = 'https://data.omgeving.vlaanderen.be/id/concept/csor'

describe('CSOR collections and variabele', () => {
  const mapper = new ConceptMapper(result)

  it('indexes skos:Collection members', () => {
    expect(result.collections.get('collectie:operationeel_stoffen_water')).toContain('csor_variabele:V_46')
  })

  it('maps a relevantCodeList collection of CSOR variabelen to an enum of their URIs', () => {
    const field = mapper.mapConcept(result.concepts.get('water:lozing-stof')!)
    expect(field?.enumValues).toContain(`${CSOR}/variabele/V_46`)
  })

  it('maps kwantiteitsAspect, drager and soortWaartbepaling to x- annotations and keeps the variabele reference', () => {
    const field = mapper.mapConcept(result.concepts.get('water:lozing-concentratie')!)
    expect(field?.extensions).toMatchObject({
      'x-kwantiteitsaspect': `${CSOR}/kwantificeerbaaraspect/KWA_1`,
      'x-drager': `${CSOR}/drager/DR_1`,
      'x-soortwaardebepaling': `${CSOR}/soortwaardebepaling/SWB_1`,
    })
    expect(field?.variabeleConceptId).toBe('water:lozing-stof')
  })

  it('generates water/lozing from current source and resolves both numeric variables through the shared context', () => {
    const record = items(property(reportingSection('Water', 'water:lozing'), 'lozing'))

    expect(property(property(record, 'additionalProperty'), 'value').enum).toContain(`${CSOR}/variabele/V_46`)
    for (const [name, aspect] of [['lozingConcentratie', 'KWA_1'], ['lozingJaarvracht', 'KWA_2']]) {
      expect(property(record, name)['x-kwantiteitsaspect']).toBe(`${CSOR}/kwantificeerbaaraspect/${aspect}`)
      expect(property(record, name)['x-variabele']).toBe('additionalProperty')
      expect(property(record, name)['x-variable-location']).toEqual({ ancestorDepth: 0, path: ['additionalProperty', 'value'] })
    }
  })
})
