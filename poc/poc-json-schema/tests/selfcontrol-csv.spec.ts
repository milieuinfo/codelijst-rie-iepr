import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sourceSnapshot } from '../scripts/source-snapshot.mjs'
import { compileTheme } from './groundwater-csv-fixture.js'
import { SchemaValidator } from '../src/services/schema-validator.js'
import { SemanticValidator } from '../src/services/semantic-validator.js'
import { transformMemberData } from '../src/services/member-layout.js'
import { CodelistParser } from '../src/services/codelist-parser.js'
import { ConceptMapper } from '../src/services/concept-mapper.js'

const load = (name: string) => JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'))

it('expands structural type schemes to all member types, including subtypes, and rejects empty schemes', () => {
  const parsed = new CodelistParser().parseData(JSON.parse(sourceSnapshot()))
  const field = parsed.concepts.get('zelfcontrole-lucht:feature')!
  const mapper = new ConceptMapper(parsed)
  const types = mapper.mapConcept(field)!.extensions!['x-reference-types']
  expect(types).toContain(parsed.expandCurie!('emissiepunt:schoorsteen'))
  expect(types).toContain(parsed.expandCurie!('emissiepunt:schoorsteen_verticale_uitstroom'))
  expect(types).not.toContain(parsed.expandCurie!('conceptscheme:emissiepunttypes'))
  for (const [id, member] of parsed.concepts) {
    if (member.inScheme === 'conceptscheme:emissiepunttypes') parsed.concepts.delete(id)
  }
  expect(() => mapper.mapConcept(field)).toThrow('has no concepts')
})

for (const [theme, slug] of [['Zelfcontrole lucht', 'zelfcontrole-lucht'], ['Zelfcontrole water', 'zelfcontrole-water']]) {
  const schema = compileTheme(JSON.parse(sourceSnapshot()), theme).subSchemas[0].schema
  const validator = new SchemaValidator()
  describe(`${theme} CSV reporting contract`, () => {
    it('validates persistent examples with optional absence, unit selections and zero uncertainty', () => {
      const data = load(`${slug}/meting`)
      expect(validator.validateInstance(schema, data).errors).toEqual([])
      expect(new SemanticValidator().validate(schema, data, {
        references: load('refs'), referenceContext: load('reference-context'),
      })).toEqual([])
      expect(transformMemberData(schema, transformMemberData(schema, data, 'presentation'), 'canonical')).toEqual(data)
      expect(validator.validateInstance(schema, {}).valid).toBe(true)
    })

    it('requires point, exact timestamp and a parameter per measurement, with named optional laboratory', () => {
      for (const change of ['point', 'timestamp', 'date-only', 'parameters', 'pollutant', 'result', 'lab-name']) {
        const data = load(`${slug}/meting`)
        const measurement = data.meting[0]
        if (change === 'point') delete measurement.hasFeatureOfInterest
        if (change === 'timestamp') delete measurement.resultTime
        if (change === 'date-only') measurement.resultTime = '2024-06-03'
        if (change === 'parameters') measurement.hasMember = []
        if (change === 'pollutant') delete measurement.hasMember[0].observedProperty
        if (change === 'result') delete measurement.hasMember[0].hasResult
        if (change === 'lab-name') delete measurement.wasAssociatedWith.label
        expect(validator.validateInstance(schema, data).valid, change).toBe(false)
      }
    })

    it('rejects fractional and out-of-range uncertainty and negative concentration', () => {
      for (const value of [-1, 100.1, 101, 0.5]) {
        const data = load(`${slug}/meting`)
        const uncertainty = data.meting[0].hasMember[0].hasResult.additionalProperty
          .find((property: { propertyID: string }) => property.propertyID.endsWith('/parameter-meetonzekerheid'))
        uncertainty.value = value
        expect(validator.validateInstance(schema, data).valid).toBe(false)
      }
      const data = load(`${slug}/meting`)
      data.meting[0].hasMember[0].hasResult.numericValue = -1
      expect(validator.validateInstance(schema, data).valid).toBe(false)
    })

    it('rejects units outside the approved collection and retains temporary text frequency', () => {
      const data = load(`${slug}/meting`)
      const result = data.meting[0].hasMember[0].hasResult
      result.hasUnit = 'https://data.omgeving.vlaanderen.be/id/concept/csor/eenheid/E_43'
      expect(validator.validateInstance(schema, data).valid).toBe(false)
      delete result.hasUnit
      delete result.numericValue
      const frequency = result.additionalProperty.find((property: { propertyID: string }) =>
        property.propertyID.endsWith('/parameter-meetfrequentie'))
      frequency.value = 12
      expect(validator.validateInstance(schema, data).valid).toBe(false)
    })
  })
}
