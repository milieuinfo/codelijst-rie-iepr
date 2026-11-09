import { DataFactory, Store, Writer, type Quad } from 'n3'
import {
  SchemaRegistry, schemaObject, selectMemberVariant, type JsonSchemaObject,
} from 'codelijst-rie-iepr-poc-json-schema/browser'
import { resolveProcesses } from './process-graph.js'
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

export interface TurtleOptions {
  year: number
  processes: Store
  created: string
  issued: string
  dependencies?: JsonSchemaObject[]
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
  const registry = new SchemaRegistry(schema, (options.dependencies ?? []).filter(item => item.$id !== schema.$id))
  const graph = new Store()
  const recordedQualifiers = new Map<string, Map<string, string>>()
  let sequence = 0
  const fresh = () => blankNode(`report${++sequence}`)
  const add = (subject: Quad['subject'], predicate: string, value: Quad['object']) => graph.addQuad(quad(subject, namedNode(predicate), value))
  const typed = (subject: Quad['subject'], type: string) => add(subject, rdf + 'type', iri(type))
  const mint = (className: string): Quad['subject'] => {
    const definition = (uriTemplates as Record<string, { template: string; mappings: Record<string, string> }>)[className]
    if (!definition) throw new Error(`Geen URI-template voor ${className}.`)
    if (!globalThis.crypto?.randomUUID) throw new Error('UUID-generatie is niet beschikbaar.')
    const values: Record<string, Quad['object']> = {
      [riepr + 'localId']: literal(globalThis.crypto.randomUUID()),
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
      const property = fresh()
      typed(property, schemaOrg + 'PropertyValue')
      add(subject, schemaOrg + 'additionalProperty', property)
      add(property, schemaOrg + 'propertyID', iri(`https://data.riepr.omgeving.vlaanderen.be/ns/vocab#${name}`))
      add(property, schemaOrg + 'value', iri(value))
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
    const properties = [rdf + 'type', 'http://www.w3.org/2000/01/rdf-schema#label', dct + 'created', dct + 'modified']
    for (const predicate of properties) {
      for (const statement of options.processes.getQuads(process, namedNode(predicate), null, null)) graph.addQuad(statement)
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
  const visit = (node: JsonSchemaObject, value: unknown, inherited?: Quad['subject']): Quad['object'] => {
    node = resolve(node)
    if (Array.isArray(node.oneOf)) node = resolve(selectMemberVariant(node, value))
    if (!object(value)) return scalar(node, value)
    const className = node['x-jsonld-type']
    const subject = typeof className === 'string' && Object.hasOwn(uriTemplates, className) ? mint(className) : fresh()
    if (typeof className === 'string' && className !== '@id') typed(subject, className)
    if (className === schemaOrg + 'PropertyValue' && Object.hasOwn(value, 'value')) addQualifiers(subject, node)
    const isObservation = className === riepr + 'Observatie' || className === riepr + 'ObservatieVerzameling'
    if (className === riepr + 'Observatie') typed(subject, sosa + 'Observation')
    if (className === riepr + 'ObservatieVerzameling') typed(subject, sosa + 'ObservationCollection')
    if (className === riepr + 'Monster') typed(subject, sosa + 'Sample')
    if (className === riepr + 'Resultaat') {
      typed(subject, sosa + 'Result')
      typed(subject, 'http://purl.org/linked-data/cube#Observation')
    }
    const properties = node.properties ?? {}
    const constructed = Object.entries(properties).flatMap(([key, child]) => {
      if (!Object.hasOwn(value, key)) return []
      const declaration = mapping(schemaObject(child))
      if (!declaration) return []
      const selected = Array.isArray(value[key]) ? value[key] : [value[key]]
      if (!selected.every(item => typeof item === 'string')) throw new Error(`Ongeldige systeemselectie: ${key}.`)
      return [{ declaration, systems: selected as string[] }]
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
      const selectedSystems = new Set(constructed.flatMap(group => group.systems))
      const resolved = resolveProcesses(options.processes, constructed.map(group => group.systems))
      const contextIds = new Set(resolved.context.map(process => process.value))
      for (const process of resolved.context) {
        addProcessContext(process)
        for (const statement of options.processes.getQuads(process, namedNode('http://www.w3.org/ns/ssn/implementedBy'), null, null)) {
          if (!selectedSystems.has(statement.object.value)) continue
          graph.addQuad(statement)
          if (statement.object.termType === 'NamedNode' || statement.object.termType === 'BlankNode') {
            typed(statement.object, 'http://www.w3.org/ns/ssn/System')
          }
        }
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
        const target = visit(itemSchema, entry, predicate === sosa + 'hasMember' ? feature : undefined)
        if (className === riepr + 'Observatie' && predicate === sosa + 'hasResult' &&
            (target.termType === 'NamedNode' || target.termType === 'BlankNode')) addQualifiers(target, node)
        add(subject, predicate, target)
      }
    }
    return subject
  }
  if (!object(data)) throw new Error('Een rapport moet een JSON-object zijn.')
  for (const [key, value] of Object.entries(data)) {
    const child = schema.properties?.[key]
    if (!child || !Array.isArray(value)) throw new Error(`Ongeldige rapporteringsgroep: ${key}.`)
    const item = schemaObject(resolve(schemaObject(child)).items)
    for (const entry of value) visit(item, entry)
  }
  return new Writer().quadsToString(graph.getQuads(null, null, null, null))
}
