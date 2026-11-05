import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { JsonSchemaObject } from '../src/models/index.js'
import type { ReferenceRecord } from '../src/services/semantic-validator.js'
import { CodelistParser } from '../src/services/codelist-parser.js'
import { ThemeResolver } from '../src/services/theme-resolver.js'
import { ConceptMapper } from '../src/services/concept-mapper.js'
import { ChainComposer } from '../src/services/chain-composer.js'
import { CompositeGroupBuilder } from '../src/services/composite-group-builder.js'
import { SchemaAssembler } from '../src/services/schema-assembler.js'
import { schemaObject } from '../src/services/schema-registry.js'

export const operationalSource = readFileSync(fileURLToPath(new URL(
  '../../../src/main/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld', import.meta.url,
)))
export const operationalResult = new CodelistParser().parseData(JSON.parse(operationalSource.toString()))
const themes = new ThemeResolver().resolveAllThemes(operationalResult)

export function reportingSection(theme: string, id: string): JsonSchemaObject {
  const chain = themes.get(theme)
  if (!chain) throw new Error(`Unknown fixture theme: ${theme}`)
  const mapper = new ConceptMapper(operationalResult)
  const builder = new CompositeGroupBuilder(operationalResult, mapper)
  const fields = new ChainComposer().composeThemeFields(operationalResult, chain, mapper, id).fields
  const section = new SchemaAssembler({}).assemble(
    theme, builder.buildNestedStructure(fields), null, chain, operationalResult,
  ).subSchemas.find(section => section.schema['x-section-concept'] === operationalResult.expandCurie!(id))
  if (!section) throw new Error(`No generated fixture section: ${id}`)
  return section.schema
}

export const property = (schema: JsonSchemaObject, name: string) => schemaObject(schema.properties?.[name])
export const items = (schema: JsonSchemaObject) => schemaObject(schema.items)
export function option(schema: JsonSchemaObject, index = 0): string {
  const value = schema.enum?.[index] ?? schema.const
  if (typeof value !== 'string') throw new Error('Expected a URI fixture choice.')
  return value
}

function component(schema: JsonSchemaObject, value: string | number) {
  return {
    propertyID: option(property(schema, 'propertyID')), value,
    ...(schema.properties?.unitCode ? { unitCode: option(property(schema, 'unitCode')) } : {}),
  }
}

function quantity(schema: JsonSchemaObject, numericValue: number) {
  const result = property(schema, 'hasResult')
  return {
    observedProperty: option(property(schema, 'observedProperty')),
    hasResult: {
      numericValue,
      ...(result.properties?.hasUnit ? { hasUnit: option(property(result, 'hasUnit')) } : {}),
    },
  }
}

function context(schema: JsonSchemaObject) {
  const data: Record<string, string | string[]> = {}
  const references: ReferenceRecord[] = []
  for (const [name, value] of Object.entries(schema.properties!)) {
    const node = schemaObject(value)
    const types = (node.type === 'array' ? items(node) : node)['x-reference-types']
    if (!Array.isArray(types)) continue
    if (!types.every((type): type is string => typeof type === 'string')) throw new Error('Invalid fixture reference types.')
    const ids = Array.from({ length: node.type === 'array' ? 2 : 1 }, (_, index) => {
      const id = `urn:synthetic:${name}:${index}`
      references.push({ id, label: `Synthetisch ${name} ${index}`, types })
      return id
    })
    data[name] = node.type === 'array' ? ids : ids[0]
  }
  return { data, references }
}

export function fuelCase() {
  const theme = 'Lucht'
  const id = 'lucht:brandstof'
  const schema = reportingSection(theme, id)
  const record = items(property(schema, 'brandstof'))
  const cover = context(schema)
  return {
    theme, id, schema, references: cover.references,
    data: {
      ...cover.data,
      brandstof: [0, 1].map(n => ({
        label: `Synthetische brandstof ${n}`,
        brandstofS: quantity(property(record, 'brandstofS'), n * 0.125),
        brandstofAs: quantity(property(record, 'brandstofAs'), n * 2.5),
        brandstofVerbruik: quantity(property(record, 'brandstofVerbruik'), n * 123.1234567890123),
      })),
    },
  }
}

export function emissionCase() {
  const theme = 'Lucht'
  const id = 'lucht:emissie'
  const schema = reportingSection(theme, id)
  const record = items(property(schema, 'emissie'))
  const member = items(property(record, 'emissieParameter'))
  const result = property(member, 'hasResult')
  const cover = context(schema)
  return {
    theme, id, schema, references: cover.references,
    data: {
      ...cover.data,
      emissie: [0, 1].map(n => ({
        type: option(property(record, 'type'), n),
        hasDuration: n,
        emissieVochtgehalte: quantity(property(record, 'emissieVochtgehalte'), n * 0.5),
        emissieTemperatuur: quantity(property(record, 'emissieTemperatuur'), 21.125),
        emissieParameter: [0, 1].map(parameter => ({
          observedProperty: option(property(member, 'observedProperty'), parameter),
          hasResult: {
            numericValue: n * 0.1234567890123 + parameter,
            hasUnit: option(property(result, 'hasUnit')),
            accrualPeriodicity: option(property(result, 'accrualPeriodicity')),
            additionalProperty: component(property(result, 'additionalProperty'), parameter * 1.25),
          },
        })),
      })),
    },
  }
}

export function normalWaterCase() {
  const theme = 'Water'
  const id = 'water:lozing'
  const schema = reportingSection(theme, id)
  const record = items(property(schema, 'lozing'))
  const procedure = property(record, 'usedProcedure')
  const cover = context(schema)
  return {
    theme, id, schema, references: cover.references,
    data: {
      ...cover.data,
      lozing: [0, 1].map(n => ({
        additionalProperty: component(property(record, 'additionalProperty'), option(property(property(record, 'additionalProperty'), 'value'), n)),
        lozingDebiet: quantity(property(record, 'lozingDebiet'), n * 123.125),
        lozingDagen: quantity(property(record, 'lozingDagen'), 365),
        lozingConcentratie: quantity(property(record, 'lozingConcentratie'), n * 0.125),
        lozingJaarvracht: quantity(property(record, 'lozingJaarvracht'), n * 45.1234567890123),
        usedProcedure: {
          type: option(property(procedure, 'type'), n),
          additionalProperty: component(property(procedure, 'additionalProperty'), option(property(property(procedure, 'additionalProperty'), 'value'))),
        },
      })),
    },
  }
}

export function abnormalWaterCase() {
  const theme = 'Water'
  const id = 'water:abnormale-lozing'
  const schema = reportingSection(theme, id)
  const record = items(property(schema, 'abnormaleLozing'))
  const result = property(record, 'hasResult')
  const cover = context(schema)
  return {
    theme, id, schema, references: cover.references,
    data: {
      ...cover.data,
      abnormaleLozing: [0, 1].map(n => ({
        observedProperty: option(property(record, 'observedProperty'), n),
        hasResult: {
          numericValue: n * 1.1234567890123, hasUnit: option(property(result, 'hasUnit')),
          additionalProperty: component(property(result, 'additionalProperty'), n),
          comment: `Synthetische verklaring ${n}`,
        },
      })),
    },
  }
}

export function waterSelfControlCase() {
  const theme = 'Zelfcontrole water'
  const id = 'zelfcontrole-water:meting'
  const schema = reportingSection(theme, id)
  const record = items(property(schema, 'meting'))
  const member = items(property(record, 'hasMember'))
  const result = property(member, 'hasResult')
  const cover = context(schema)
  return {
    theme, id, schema, references: cover.references,
    data: {
      ...cover.data,
      meting: [0, 1].map(n => ({
        resultTime: `2024-01-0${n + 1}`,
        madeBySensor: { label: `Synthetisch laboratorium ${n}`, registration: `000${n}` },
        hasMember: [0, 1].map(parameter => ({
          observedProperty: option(property(member, 'observedProperty'), parameter),
          hasResult: {
            numericValue: n * 0.1234567890123 + parameter, hasUnit: option(property(result, 'hasUnit')),
            parameterSoort: component(property(result, 'parameterSoort'), 'Mengmonster'),
            parameterMeetonzekerheid: component(property(result, 'parameterMeetonzekerheid'), parameter * 1.25),
            accrualPeriodicity: option(property(result, 'accrualPeriodicity')),
          },
        })),
      })),
    },
  }
}

export const operationalCases = [
  fuelCase(), emissionCase(), normalWaterCase(), abnormalWaterCase(), waterSelfControlCase(),
]
