import { describe, it, expect } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { CodelistParser } from '../src/services/codelist-parser.js'
import { ConceptMapper } from '../src/services/concept-mapper.js'

const PROJECT_ROOT = path.resolve(__dirname, '..')
const CODELIST = path.join(PROJECT_ROOT, 'public/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld')
const CSOR = 'https://data.omgeving.vlaanderen.be/id/concept/csor'

describe('CSOR collections and variabele', () => {
  const result = new CodelistParser().loadFromFile(CODELIST)
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

  it('generated water/lozing schema keeps both numeric values and points them at the stof property', async () => {
    const content = await fs.readFile(path.join(PROJECT_ROOT, 'output/schema/water/lozing/schema.json'), 'utf-8')
    const schema = JSON.parse(content) as any
    const props = schema.properties.hasMember.items.properties as Record<string, any>

    expect(props.parameter.enum).toContain(`${CSOR}/variabele/V_46`)
    expect(props.lozingConcentratie['x-kwantiteitsaspect']).toBe(`${CSOR}/kwantificeerbaaraspect/KWA_1`)
    expect(props.lozingConcentratie['x-variabele']).toBe('parameter')
    expect(props.lozingJaarvracht['x-kwantiteitsaspect']).toBe(`${CSOR}/kwantificeerbaaraspect/KWA_2`)
    expect(props.lozingJaarvracht['x-variabele']).toBe('parameter')
  })
})
