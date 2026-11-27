import { DataFactory, Store, Writer, type Quad } from 'n3'
import {
  SchemaRegistry, canonicalJson, dependencySelections, referenceDependency, referenceMatchesDependency,
  reportingRecordId, reportingRecords, schemaObject, selectMemberVariant, sourceSelections,
  type JsonSchemaObject, type ReferenceScope, type ReportingDocument,
} from 'codelijst-rie-iepr-poc-json-schema/browser'
import { cubeProfile, resultDsd, resultDataset } from '../../../../src/utils/cube-profile.js'
import { sha256 } from '@noble/hashes/sha256'
import { resolveProcesses } from './process-graph.js'
import { PREFIXES } from './vocab.js'
import uriTemplates from '../generated/uri-templates.json'

const { namedNode, blankNode, literal, quad } = DataFactory
const rdf = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const sosa = 'http://www.w3.org/ns/sosa/'
const riepr = 'https://data.riepr.omgeving.vlaanderen.be/ns/riepr#'
const prov = 'http://www.w3.org/ns/prov#'
const dct = 'http://purl.org/dc/terms/'
const xsd = 'http://www.w3.org/2001/XMLSchema#'
const time = 'http://www.w3.org/2006/time#'
const schemaOrg = 'https://schema.org/'
const qb = 'http://purl.org/linked-data/cube#'
const implementedBy = 'http://www.w3.org/ns/ssn/implementedBy'
const turtlePrefixes = {
  ...PREFIXES,
  prov,
  dcterms: dct,
  time,
  schema: schemaOrg,
  qudt: 'http://qudt.org/schema/qudt/',
  ssn: 'http://www.w3.org/ns/ssn/',
  pplan: 'http://purl.org/net/p-plan#',
  qb: 'http://purl.org/linked-data/cube#',
  vocab: 'https://data.riepr.omgeving.vlaanderen.be/ns/vocab#',
}
const qualifiers = {
  'x-kwantiteitsaspect': 'kwantiteitsAspect',
  'x-drager': 'drager',
  'x-soortwaardebepaling': 'soortWaartbepaling',
} as const

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const iri = (value: unknown) => {
  if (typeof value !== 'string') throw new Error('Een RDF-IRI moet een tekstwaarde zijn.')
  try { new URL(value) } catch { throw new Error(`Ongeldige RDF-IRI: ${value}`) }
  return namedNode(value)
}

const formatUuid = (bytes: Uint8Array, version: 4 | 8): string => {
  bytes[6] = (bytes[6] & 0x0f) | (version << 4)
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const randomUuid = (): string => {
  const crypto = globalThis.crypto
  if (crypto?.randomUUID) return crypto.randomUUID()
  if (!crypto?.getRandomValues) throw new Error('UUID-generatie is niet beschikbaar.')
  return formatUuid(crypto.getRandomValues(new Uint8Array(16)), 4)
}

export const demonstrationReportIri = (): string => `urn:uuid:${randomUuid()}`

const keyedUuid = (key: string): string => formatUuid(sha256(new TextEncoder().encode(key)).slice(0, 16), 8)

const decimal = (value: number): string => {
  const text = String(value)
  if (!/[eE]/.test(text)) return text
  const [mantissa, exponentText] = text.toLowerCase().split('e')
  const negative = mantissa.startsWith('-')
  const parts = (negative ? mantissa.slice(1) : mantissa).split('.')
  const digits = parts.join('')
  const point = parts[0].length + Number(exponentText)
  const expanded = point <= 0 ? `0.${'0'.repeat(-point)}${digits}`
    : point >= digits.length ? digits + '0'.repeat(point - digits.length)
      : `${digits.slice(0, point)}.${digits.slice(point)}`
  return (negative ? '-' : '') + expanded
}

/**
 * Format subject spacing and nested blank-node indentation.
 * @param turtle - Serialized Turtle.
 * @returns Formatted Turtle.
 */
function formatTurtle(turtle: string): string {
  const lines = turtle.split('\n')
  const formatted: string[] = []
  const blankNodes: number[] = []
  const adjustBlankNodeIndentation = (line: string, indentation: number) => {
    let quote: string | undefined
    let iri = false
    let escaped = false
    for (const character of line) {
      if (escaped) {
        escaped = false
      } else if (character === '\\' && (quote || iri)) {
        escaped = true
      } else if (quote) {
        if (character === quote) quote = undefined
      } else if (iri) {
        if (character === '>') iri = false
      } else if (character === '"' || character === "'") {
        quote = character
      } else if (character === '<') {
        iri = true
      } else if (character === '#') {
        break
      } else if (character === '[') {
        blankNodes.push(indentation)
      } else if (character === ']') {
        blankNodes.pop()
      }
    }
  }

  for (let index = 0; index < lines.length; index++) {
    const content = lines[index].trimStart()
    if (!content) {
      formatted.push('')
      continue
    }
    const closesBlankNode = content.startsWith(']')
    const indentation = blankNodes.length
      ? closesBlankNode ? blankNodes[blankNodes.length - 1] : blankNodes[blankNodes.length - 1] + 2
      : lines[index].length - content.length
    const line = `${' '.repeat(indentation)}${content}`
    formatted.push(line)
    adjustBlankNodeIndentation(line, indentation)

    const next = lines[index + 1]?.trimStart()
    if (!/^@(?:prefix|base)\b/.test(content) && blankNodes.length === 0 &&
        line.trimEnd().endsWith('.') && next && !/^@(?:prefix|base)\b/.test(next)) {
      formatted.push('')
    }
  }
  return formatted.join('\n')
}

export interface TurtleOptions {
  report: string
  year: number
  processes: Store
  created: string
  issued: string
  dependencies?: JsonSchemaObject[]
  reports?: ReportingDocument[]
}

/**
 * Serialize validated canonical reporting JSON using its published schema annotations.
 * @param schema - The reporting section schema.
 * @param data - Validated canonical reporting data.
 * @param options - Production year and explicit process context.
 * @returns A Turtle representation.
 */
export function exportTurtle(schema: JsonSchemaObject, data: unknown, options: TurtleOptions): string {
  if (!Number.isInteger(options.year) || options.year < 1 || options.year > 9998) throw new Error('Ongeldig productiejaar.')
  const timestamp = (value: string, label: string) => {
    const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value)
    if (!parts) throw new Error(`Ongeldige ${label}.`)
    const [, year, month, day, hour, minute, second, , offsetHour = '0', offsetMinute = '0'] = parts
    const leap = Number(year) % 4 === 0 && (Number(year) % 100 !== 0 || Number(year) % 400 === 0)
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    if (Number(year) < 1 || Number(month) < 1 || Number(month) > 12 || Number(day) < 1 ||
        Number(day) > days[Number(month) - 1] || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 ||
        Number(offsetHour) > 14 || Number(offsetMinute) > 59 ||
        (Number(offsetHour) === 14 && Number(offsetMinute) !== 0) || !Number.isFinite(Date.parse(value))) {
      throw new Error(`Ongeldige ${label}.`)
    }
    return new Date(value).toISOString()
  }
  const created = timestamp(options.created, 'creatiedatum')
  const issued = timestamp(options.issued, 'indieningsdatum')
  const dependencies = new Map<string | undefined, JsonSchemaObject>()
  for (const dependency of [...(options.dependencies ?? []), ...(options.reports ?? []).flatMap(report =>
    [report.schema, ...(report.dependencies ?? [])])]) {
    if (dependency.$id === schema.$id) continue
    const previous = dependencies.get(dependency.$id)
    if (previous && previous !== dependency && canonicalJson(previous) !== canonicalJson(dependency)) {
      throw new Error(`Conflicterend afhankelijk schema: ${dependency.$id}.`)
    }
    dependencies.set(dependency.$id, dependency)
  }
  const registry = new SchemaRegistry(schema, [...dependencies.values()])
  const reports = new Map(reportingRecords(options.reports ?? []).map(record => [record.reference.id, record]))
  const reportedSubjects = new Map<string, { subject: Quad['subject']; data: unknown }>()
  const graph = new Store()
  const resultSources = new Map<string, { subject: Quad['subject']; source: string }>()
  const recordedQualifiers = new Map<string, Map<string, string>>()
  let sequence = 0
  const fresh = () => blankNode(`report${++sequence}`)
  const add = (subject: Quad['subject'], predicate: string, value: Quad['object']) => graph.addQuad(quad(subject, namedNode(predicate), value))
  const typed = (subject: Quad['subject'], type: string) => add(subject, rdf + 'type', iri(type))
  const mint = (className: string, key?: string): Quad['subject'] => {
    const definition = (uriTemplates as Record<string, { template: string; mappings: Record<string, string> }>)[className]
    if (!definition) throw new Error(`Geen URI-template voor ${className}.`)
    const values: Record<string, Quad['object']> = {
      [riepr + 'localId']: literal(key === undefined ? randomUuid() : keyedUuid(`${className}:${key}`)),
      [riepr + 'productiejaar']: literal(String(options.year).padStart(4, '0'), namedNode(xsd + 'gYear')),
      [dct + 'created']: literal(created, namedNode(xsd + 'dateTime')),
      [dct + 'issued']: literal(issued, namedNode(xsd + 'dateTime')),
    }
    const uri = definition.template.replace(/\{([a-z]+)\}/g, (_match, variable: string) => {
      const property = definition.mappings[variable]
      const value = values[property]
      if (!value) throw new Error(`Geen waarde voor URI-variabele ${variable} van ${className}.`)
      return encodeURIComponent(value.value)
    })
    const subject = iri(uri)
    for (const property of Object.values(definition.mappings)) {
      const value = values[property]
      if (!value) throw new Error(`Geen waarde voor URI-eigenschap ${property} van ${className}.`)
      add(subject, property, value)
    }
    return subject
  }
  const addQualifiers = (subject: Quad['subject'], node: JsonSchemaObject) => {
    const recorded = recordedQualifiers.get(subject.value) ?? new Map<string, string>()
    recordedQualifiers.set(subject.value, recorded)
    for (const [annotation, name] of Object.entries(qualifiers)) {
      const value = node[annotation]
      if (value === undefined) continue
      if (typeof value !== 'string') throw new Error(`Ongeldige CSOR-annotatie: ${annotation}.`)
      const previous = recorded.get(name)
      if (previous && previous !== value) throw new Error(`Conflicterende CSOR-annotatie: ${annotation}.`)
      if (previous) continue
      recorded.set(name, value)
      add(subject, turtlePrefixes.vocab + name, iri(value))
    }
  }
  const addProcessContext = (process: Quad['subject']) => {
    const labels = options.processes.getObjects(process, namedNode('http://www.w3.org/2000/01/rdf-schema#label'), null)
    if (!labels.length || labels.some(label => label.termType !== 'Literal')) {
      throw new Error(`Proces ${process.value} heeft geen geldige benaming.`)
    }
    for (const predicate of [dct + 'created', dct + 'modified']) {
      const values = options.processes.getObjects(process, namedNode(predicate), null)
      if (values.length !== 1 || values[0].termType !== 'Literal' ||
          values[0].datatype.value !== xsd + 'dateTime' || !Number.isFinite(Date.parse(values[0].value))) {
        throw new Error(`Proces ${process.value} heeft geen geldige ${predicate}.`)
      }
    }
    const properties = [rdf + 'type', 'http://www.w3.org/2000/01/rdf-schema#label', dct + 'created', dct + 'modified', implementedBy]
    for (const predicate of properties) {
      for (const statement of options.processes.getQuads(process, namedNode(predicate), null, null)) {
        graph.addQuad(statement)
        if (predicate === implementedBy && (statement.object.termType === 'NamedNode' || statement.object.termType === 'BlankNode')) {
          typed(statement.object, 'http://www.w3.org/ns/ssn/System')
        }
      }
    }
    if (!graph.has(process, namedNode(rdf + 'type'), namedNode(riepr + 'Proces'), null)) {
      throw new Error(`Proces ${process.value} heeft geen expliciet riepr:Proces-type.`)
    }
  }
  const period = (feature: Quad['subject']) => {
    const interval = fresh()
    typed(interval, time + 'Interval')
    add(feature, dct + 'temporal', interval)
    for (const [predicate, year] of [['hasBeginning', options.year], ['hasEnd', options.year + 1]] as const) {
      const instant = fresh()
      typed(instant, time + 'Instant')
      add(interval, time + predicate, instant)
      add(instant, time + 'inXSDDate', literal(`${String(year).padStart(4, '0')}-01-01`, namedNode(xsd + 'date')))
    }
  }
  const resolve = (node: JsonSchemaObject) => registry.resolve(node)
  const mapping = (node: JsonSchemaObject): Record<string, unknown> | undefined => {
    const direct = resolve(node)
    const item = direct.items ? resolve(schemaObject(direct.items)) : undefined
    const value = direct['x-feature-mapping'] ?? item?.['x-feature-mapping']
    if (value === undefined) return undefined
    if (!object(value)) throw new Error('Ongeldige feature-mapping in het schema.')
    return value
  }
  const scalar = (node: JsonSchemaObject, value: unknown): Quad['object'] => {
    const datatype = node['x-jsonld-type']
    if (datatype === '@id') return iri(value)
    if (typeof value === 'boolean') return literal(String(value), namedNode(xsd + 'boolean'))
    if (typeof value === 'number' && Number.isFinite(value)) {
      return literal(decimal(value), namedNode(typeof datatype === 'string' && datatype.startsWith(xsd)
        ? datatype : xsd + (node.type === 'integer' ? 'integer' : 'decimal')))
    }
    if (typeof value !== 'string') throw new Error('Ongeldige scalaire RDF-waarde.')
    return typeof datatype === 'string' && datatype.startsWith(xsd) ? literal(value, namedNode(datatype)) : literal(value)
  }
  const visit = (
    node: JsonSchemaObject, value: unknown, inherited?: Quad['subject'], scopes: ReferenceScope[] = [],
  ): Quad['object'] => {
    node = resolve(node)
    if (Array.isArray(node.oneOf)) node = resolve(selectMemberVariant(node, value))
    if (!object(value)) {
      if (node['x-reference-records']) {
        if (typeof value !== 'string') throw new Error('Ongeldige rapporteringssleutel.')
        const report = reports.get(value)
        const types = node['x-reference-types']
        if (!report || report.document.year !== options.year || !Array.isArray(types) ||
            !report.reference.types.some(type => types.includes(type))) {
          throw new Error(`Gerapporteerd record ontbreekt in de geselecteerde context: ${value}.`)
        }
        const dependency = referenceDependency(node)
        if (dependency && !referenceMatchesDependency(report.reference, dependency,
          dependencySelections(dependency, scopes, resolve))) {
          throw new Error('Het gerapporteerde record hoort niet bij de geselecteerde installatie.')
        }
        return reportedSubjects.get(value)?.subject ?? visit(report.schema, report.data)
      }
      return scalar(node, value)
    }
    const key = node['x-table-key'] === undefined ? undefined : reportingRecordId(node, value, options.year, resolve)
    const previous = key === undefined ? undefined : reportedSubjects.get(key)
    if (previous) {
      if (canonicalJson(previous.data) !== canonicalJson(value)) throw new Error(`Conflicterende rapportering voor sleutel ${key}.`)
      return previous.subject
    }
    const className = node['x-jsonld-type']
    const subject = typeof className === 'string' && Object.hasOwn(uriTemplates, className) ? mint(className, key) : fresh()
    if (key !== undefined) reportedSubjects.set(key, { subject, data: value })
    if (typeof className === 'string' && className !== '@id') typed(subject, className)
    if (className === prov + 'Agent') typed(subject, riepr + 'Uitvoerder')
    if (className === schemaOrg + 'PropertyValue' && Object.hasOwn(value, 'value')) addQualifiers(subject, node)
    const isObservation = className === riepr + 'Observatie' || className === riepr + 'ObservatieVerzameling'
    if (className === riepr + 'Observatie') typed(subject, sosa + 'Observation')
    if (className === riepr + 'ObservatieVerzameling') typed(subject, sosa + 'ObservationCollection')
    if (className === riepr + 'Monster') typed(subject, sosa + 'Sample')
    if (className === riepr + 'Resultaat') {
      typed(subject, sosa + 'Result')
      typed(subject, 'http://purl.org/linked-data/cube#Observation')
    }
    if (className === sosa + 'Sampling' && node['x-ultimate-feature-of-interest-source'] !== undefined) {
      if (!inherited) throw new Error('Monstername zonder geërfd kenmerk van belang.')
      add(subject, sosa + 'hasUltimateFeatureOfInterest', inherited)
    }
    const properties = node.properties ?? {}
    const childScopes = [{ schema: node, value }, ...scopes]
    const constructed = Object.entries(properties).flatMap(([key, child]) => {
      if (!Object.hasOwn(value, key)) return []
      const declaration = mapping(schemaObject(child))
      if (!declaration) return []
      const selected = Array.isArray(value[key]) ? value[key] : [value[key]]
      if (!selected.every(item => typeof item === 'string')) throw new Error(`Ongeldige processelectie: ${key}.`)
      return [{ declaration, processes: selected as string[] }]
    })
    let feature = inherited
    if (constructed.length) {
      const classes = constructed[0].declaration.classes
      if (!Array.isArray(classes) || classes.length !== 1 || typeof classes[0] !== 'string' ||
          constructed.some(group => JSON.stringify(group.declaration.classes) !== JSON.stringify(classes) ||
            group.declaration.relation !== sosa + 'hasFeatureOfInterest')) {
        throw new Error('Niet-ondersteunde of conflicterende feature-mapping.')
      }
      feature = mint(classes[0])
      typed(feature, classes[0])
      typed(feature, sosa + 'FeatureOfInterest')
      period(feature)
      const resolved = resolveProcesses(options.processes, constructed.map(group => group.processes))
      const contextIds = new Set(resolved.context.map(process => process.value))
      for (const process of resolved.context) {
        addProcessContext(process)
        for (const statement of options.processes.getQuads(process, namedNode('http://purl.org/net/p-plan#isPrecededBy'), null, null)) {
          if (contextIds.has(statement.object.value)) graph.addQuad(statement)
        }
      }
      for (const process of resolved.derived) {
        add(feature, prov + 'wasDerivedFrom', process)
        const transport = namedNode('https://data.omgeving.vlaanderen.be/id/concept/riepr/procedure-type/transport')
        if (options.processes.has(process, namedNode(dct + 'type'), transport, null)) {
          add(process, dct + 'type', transport)
          typed(transport, sosa + 'Procedure')
        }
      }
    } else {
      for (const [key, child] of Object.entries(properties)) {
        const definition = resolve(schemaObject(child))
        if (definition['x-jsonld-id'] !== sosa + 'hasFeatureOfInterest' || !Object.hasOwn(value, key)) continue
        if (Array.isArray(value[key])) throw new Error(`Meerdere directe features zijn niet toegestaan: ${key}.`)
        feature = iri(value[key])
        const types = definition['x-reference-types']
        if (Array.isArray(types) && types.includes(riepr + 'Proces')) addProcessContext(feature)
        typed(feature, sosa + 'FeatureOfInterest')
      }
    }
    if (isObservation && feature) add(subject, sosa + 'hasFeatureOfInterest', feature)
    if (isObservation && !feature) throw new Error('Observatie zonder feature of interest.')
    if (className === riepr + 'ObservatieVerzameling' && (!Array.isArray(value.hasMember) || !value.hasMember.length)) {
      throw new Error('Observatieverzameling zonder leden kan niet aan de ontologie voldoen.')
    }
    if (className === riepr + 'Observatie' && !Object.hasOwn(value, 'hasResult')) {
      throw new Error('Observatie zonder resultaat kan niet aan de ontologie voldoen.')
    }
    for (const [key, item] of Object.entries(value)) {
      const childValue = properties[key]
      if (!childValue) throw new Error(`Geen schemadefinitie voor ${key}.`)
      const child = resolve(schemaObject(childValue))
      if (mapping(child)) continue
      const predicate = child['x-jsonld-id']
      if (predicate === '@type') {
        if (item !== className) throw new Error('Tegenstrijdige klasse in het rapport.')
        continue
      }
      if (predicate === sosa + 'hasFeatureOfInterest' && isObservation) continue
      if (typeof predicate !== 'string') throw new Error(`Geen RDF-predicaat voor ${key}.`)
      const values = Array.isArray(item) ? item : [item]
      const itemSchema = child.type === 'array' ? resolve(schemaObject(child.items)) : child
      if (className === riepr + 'Resultaat' || className === schemaOrg + 'PropertyValue') addQualifiers(subject, child)
      for (const entry of values) {
        const passesFeature = predicate === sosa + 'hasMember' || predicate === prov + 'used' ||
          predicate === sosa + 'isResultOf'
        const target = visit(itemSchema, entry, passesFeature ? feature ?? inherited : undefined, childScopes)
        if (className === riepr + 'Observatie' && predicate === sosa + 'hasResult' &&
            (target.termType === 'NamedNode' || target.termType === 'BlankNode')) {
          addQualifiers(target, node)
          const sourceNode = itemSchema['x-implicit-result'] ? node : itemSchema
          const source = sourceNode['x-source-concept'] ?? sourceNode['x-derived-from-source']
          if (typeof source !== 'string') throw new Error('Resultaat zonder bronconcept voor de DSD.')
          const previous = resultSources.get(target.value)
          if (previous && previous.source !== source) throw new Error('Resultaat met conflicterende DSD-bronconcepten.')
          resultSources.set(target.value, { subject: target, source })
        }
        add(subject, predicate, target)
      }
    }
    if (className === riepr + 'Resultaat') {
      const sources = new Set<string>()
      for (const definition of [node, ...Object.keys(value).map(key => resolve(schemaObject(properties[key])))]) {
        const source = definition['x-variable-concept']
        if (source === undefined) continue
        if (typeof source !== 'string' || !source) throw new Error('Ongeldige variabelebron.')
        sources.add(source)
      }
      for (const source of sources) {
        const selected = sourceSelections(source, childScopes, resolve)
        if (selected.length !== 1) throw new Error(`Geen eenduidige variabele voor ${source}.`)
        const variable = iri(selected[0])
        const existing = graph.getObjects(subject, namedNode(turtlePrefixes.vocab + 'variabele'), null)
        if (existing.length) {
          if (existing.length !== 1 || !existing[0].equals(variable)) {
            throw new Error(`Conflicterende variabele voor ${source}.`)
          }
          continue
        }
        add(subject, turtlePrefixes.vocab + 'variabele', variable)
      }
    }
    return subject
  }
  if (!object(data)) throw new Error('Een rapport moet een JSON-object zijn.')
  const conditionSources = new Set(Object.values(schema.properties ?? {}).flatMap(child => {
    const condition = resolve(schemaObject(child))['x-visible-when']
    return object(condition) && typeof condition.sourceConcept === 'string' ? [condition.sourceConcept] : []
  }))
  for (const [key, value] of Object.entries(data)) {
    const child = schema.properties?.[key]
    if (!child) throw new Error(`Ongeldige rapporteringsgroep: ${key}.`)
    const definition = resolve(schemaObject(child))
    const source = definition['x-source-concept']
    if (definition.type === 'boolean' && definition['x-jsonld-id'] === undefined &&
        typeof source === 'string' && conditionSources.has(source)) {
      if (typeof value !== 'boolean') throw new Error(`Ongeldige UI-sturing: ${key}.`)
      continue
    }
    if (!Array.isArray(value)) throw new Error(`Ongeldige rapporteringsgroep: ${key}.`)
    const item = schemaObject(definition.items)
    for (const entry of value) visit(item, entry)
  }
  const equivalent = (left: Quad['object'], right: Quad['object']) => left.equals(right) ||
    (left.termType === 'Literal' && right.termType === 'Literal' &&
      left.datatype.value === xsd + 'dateTime' && right.datatype.value === xsd + 'dateTime' &&
      Number.isFinite(Date.parse(left.value)) && Date.parse(left.value) === Date.parse(right.value))
  const contextObjects = (subject: Quad['subject'], predicate: string, seen = new Set<string>()): Quad['object'][] => {
    if (seen.has(subject.value)) throw new Error('Cyclische gedeelde observatiecontext.')
    const values = graph.getObjects(subject, namedNode(predicate), null)
    if (cubeProfile.sharedContext.includes(predicate)) {
      const next = new Set(seen).add(subject.value)
      for (const parent of graph.getSubjects(namedNode(sosa + 'hasMember'), subject, null)) {
        if (graph.has(parent, namedNode(rdf + 'type'), namedNode(sosa + 'ObservationCollection'), null)) {
          values.push(...contextObjects(parent, predicate, next))
        }
      }
    }
    const unique = values.filter((value, index) => values.findIndex(other => equivalent(other, value)) === index)
    if (unique.length > 1 && cubeProfile.sharedContext.includes(predicate)) {
      throw new Error(`Conflicterende gedeelde observatiecontext voor ${predicate}.`)
    }
    return unique
  }
  const attach = (subject: Quad['subject'], predicate: string, value: Quad['object']) => {
    const previous = graph.getObjects(subject, namedNode(predicate), null)
    if (previous.some(term => !equivalent(term, value))) throw new Error(`Conflicterende Cube-waarde voor ${predicate}.`)
    if (!previous.length) add(subject, predicate, value)
  }
  for (const type of ['Observation', 'ObservationCollection']) {
    for (const subject of graph.getSubjects(namedNode(rdf + 'type'), namedNode(sosa + type), null)) {
      for (const predicate of cubeProfile.sharedContext) contextObjects(subject, predicate)
    }
  }
  for (const { subject, source } of resultSources.values()) {
    for (const property of cubeProfile.properties.filter(property => property.role === 'measure')) {
      const values = graph.getObjects(subject, namedNode(property.predicate), null)
      if (values.length !== 1 || values[0].termType !== 'Literal' ||
          ![xsd + 'decimal', xsd + 'integer', xsd + 'double', xsd + 'float'].includes(values[0].datatype.value) ||
          !values[0].value.trim() || !Number.isFinite(Number(values[0].value))) {
        throw new Error(`Resultaat ${source} heeft niet precies één geldige numerieke meetwaarde; RDF Cube-export is geblokkeerd.`)
      }
    }
    const dataset = resultDataset(resultDsd(source), { ...options, created, issued })
    const datasetNode = iri(dataset.id)
    typed(datasetNode, dataset.className)
    typed(datasetNode, qb + 'DataSet')
    for (const [predicate, value] of Object.entries(dataset.values)) {
      attach(datasetNode, predicate, value.datatype ? literal(value.value, namedNode(value.datatype)) : iri(value.value))
    }
    attach(subject, qb + 'dataSet', datasetNode)
    for (const property of cubeProfile.properties.filter(property => property.path)) {
      let values: Quad['object'][] = [subject]
      for (const step of property.path!) {
        const projected: Quad['object'][] = []
        for (const value of values) {
          if (value.termType !== 'NamedNode' && value.termType !== 'BlankNode') throw new Error('Contextpad loopt door een letterlijke waarde.')
          projected.push(...(step.inverse
            ? graph.getSubjects(namedNode(step.predicate), value, null)
            : contextObjects(value, step.predicate)))
        }
        values = projected.filter((value, index) => projected.findIndex(other => other.equals(value)) === index)
      }
      if (values.length > 1 || (property.role === 'dimension' && values.length !== 1)) {
        throw new Error(`Geen eenduidige Cube-context voor ${property.predicate} bij ${source}.`)
      }
      for (const value of values) attach(subject, property.predicate, value)
    }
  }
  if (graph.getSubjects(namedNode(rdf + 'type'), namedNode(riepr + 'Resultaat'), null).length !== resultSources.size) {
    throw new Error('Resultaat zonder bronobservatie of DSD-koppeling.')
  }
  const quads = graph.getQuads(null, null, null, null)
  const terms = quads.flatMap(({ subject, predicate, object }) =>
    [subject, predicate, object, ...(object.termType === 'Literal' ? [object.datatype] : [])])
  const prefixes = Object.fromEntries(Object.entries(turtlePrefixes).filter(([, namespace]) =>
    terms.some(term => term.termType === 'NamedNode' && term.value.startsWith(namespace))))
  const writer = new Writer({ format: 'text/turtle', prefixes })
  const incoming = new Map<string, number>()
  for (const { object } of quads) {
    if (object.termType === 'BlankNode') incoming.set(object.value, (incoming.get(object.value) ?? 0) + 1)
  }
  const inline = (term: Quad['object'], stack = new Set<string>()): Quad['object'] => {
    if (term.termType !== 'BlankNode' || stack.has(term.value) || incoming.get(term.value) !== 1) return term
    const descendants = graph.getQuads(term, null, null, null)
    const next = new Set(stack).add(term.value)
    return writer.blank(descendants.map(({ predicate, object }) => ({
      predicate,
      object: inline(object, next),
    })))
  }
  for (const { subject, predicate, object, graph: graphName } of quads) {
    if (subject.termType === 'BlankNode' && incoming.get(subject.value) === 1) continue
    writer.addQuad(subject, predicate, inline(object), graphName)
  }
  let turtle: string | undefined
  writer.end((error, result) => {
    if (error) throw error
    turtle = result
  })
  if (turtle === undefined) throw new Error('Turtle kon niet worden gemaakt.')
  return formatTurtle(turtle)
}
