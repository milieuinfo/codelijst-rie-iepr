import type { JsonSchemaObject } from '../models/index.js'
import { isCollectionClass, isObservationClass } from '../config.js'
import { homogeneousProperties } from './schema-assembler.js'
import { pointerToken, schemaObject, SchemaRegistry } from './schema-registry.js'
import { selectMemberVariant } from './member-layout.js'
import { referenceSnapshot } from './reference-schema.js'

export interface ReferenceRecord {
  id: string
  label: string
  types: string[]
  parents?: string[]
  year?: number
}

export interface ReferenceContext {
  year?: number
  ids?: string[]
}

export interface SemanticDiagnostic {
  instancePath: string
  keyword: 'homogeneous' | 'membership' | 'identity' | 'reference' | 'temporal-range'
  message: string
}

interface ValueLocation {
  value: unknown
  schema: JsonSchemaObject
  path: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function canonical(value: unknown, identityOnly = true): string {
  if (isObject(value)) {
    if (identityOnly && typeof value['@id'] === 'string') return JSON.stringify(value['@id'])
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key], identityOnly)}`).join(',')}}`
  }
  if (Array.isArray(value)) return `[${value.map(item => canonical(item, identityOnly)).join(',')}]`
  return JSON.stringify(value)
}

function timestamp(value: string): [number, string] | undefined {
  const instant = Date.parse(value)
  if (!Number.isFinite(instant)) return undefined
  const fraction = value.match(/\.(\d+)(?:z|[+-]\d{2}(?::?\d{2})?)$/i)?.[1] ?? ''
  return [Math.floor(instant / 1000), fraction.replace(/0+$/, '')]
}

function sharedValue(location: ValueLocation): string {
  if (location.schema.format === 'date-time' && typeof location.value === 'string') {
    const instant = timestamp(location.value)
    if (instant) return JSON.stringify(instant)
  }
  return canonical(location.value)
}

export class SemanticValidator {
  validate(
    schema: JsonSchemaObject, data: unknown,
    options: { dependencies?: JsonSchemaObject[]; references?: ReferenceRecord[]; referenceContext?: ReferenceContext } = {},
  ): SemanticDiagnostic[] {
    const snapshot = referenceSnapshot(schema)
    if (snapshot) options = {
      ...options, references: options.references ?? snapshot.references,
      referenceContext: options.referenceContext ?? snapshot.referenceContext,
    }
    const registry = new SchemaRegistry(schema, options.dependencies)
    const errors: SemanticDiagnostic[] = []
    const references = new Map<string, ReferenceRecord>()
    for (const reference of options.references ?? []) {
      if (references.has(reference.id)) throw new Error(`Duplicate reference-data identity: ${reference.id}`)
      references.set(reference.id, reference)
    }
    const identities = new Map<string, ValueLocation>()
    const report = (location: ValueLocation, keyword: SemanticDiagnostic['keyword'], message: string) => {
      errors.push({ instancePath: location.path, keyword, message })
    }

    const visit = (
      location: ValueLocation, inherited = new Map<string, ValueLocation>(),
      referenceScope = new Set(options.referenceContext?.ids ?? []),
    ): void => {
      let node: JsonSchemaObject
      try { node = selectMemberVariant(registry.resolve(location.schema), location.value) }
      catch (error) {
        report(location, 'membership', error instanceof Error ? error.message : String(error))
        return
      }
      const value = location.value
      const expectedTypes = node['x-reference-types']
      if (typeof value === 'string' && Array.isArray(expectedTypes)) {
        const reference = references.get(value)
        const local = identities.get(value)
        const localType = local?.schema['x-jsonld-type']
        if (!reference && !local) {
          report(location, 'reference', options.references
            ? `Unknown reference: ${value}` : `Reference data is required for ${value}.`)
        } else if (!expectedTypes.some(type => reference?.types.includes(type) || type === localType)) {
          report(location, 'reference', `Reference ${value} does not have one of the declared types.`)
        }
        if (reference?.year !== undefined && reference.year !== options.referenceContext?.year) {
          report(location, 'reference', `Reference ${value} belongs to reporting year ${reference.year}; supply a matching reference context.`)
        }
        if (reference?.parents?.length && !reference.parents.some(parent => referenceScope.has(parent))) {
          report(location, 'reference', `Reference ${value} is outside the selected parent context.`)
        }
      }
      if (Array.isArray(value)) {
        if (!node.items) throw new Error(`Missing item schema at ${location.path}`)
        value.forEach((item, index) => visit({
          value: item, schema: schemaObject(node.items), path: `${location.path}/${index}`,
        }, inherited, referenceScope))
        return
      }
      if (!isObject(value)) return
      if (node['x-temporal-range'] && typeof value.start === 'string' && typeof value.end === 'string') {
        const start = timestamp(value.start)
        const end = timestamp(value.end)
        if (start && end && (start[0] > end[0] || (start[0] === end[0] && start[1] > end[1]))) {
          report(location, 'temporal-range', 'The end of the period precedes its start.')
        }
      }
      const properties = Object.entries(node.properties ?? {}).filter(([key]) => Object.hasOwn(value, key)).map(([key, child]) => ({
        value: value[key], schema: registry.resolve(schemaObject(child)), path: `${location.path}/${pointerToken(key)}`,
      }))
      const relation = (child: ValueLocation): unknown =>
        child.schema['x-jsonld-id'] ?? (child.schema.items ? registry.resolve(schemaObject(child.schema.items))['x-jsonld-id'] : undefined)
      const type = typeof node['x-jsonld-type'] === 'string' ? node['x-jsonld-type'] : undefined
      const localScope = new Set(referenceScope)
      if (typeof value['@id'] === 'string') localScope.add(value['@id'])
      for (const child of properties) {
        const definition = child.schema.items ? registry.resolve(schemaObject(child.schema.items)) : child.schema
        if (Array.isArray(definition['x-reference-types'])) {
          for (const selected of Array.isArray(child.value) ? child.value : [child.value]) {
            if (typeof selected === 'string') localScope.add(selected)
          }
        }
      }
      const effective = new Map(inherited)
      if (isObservationClass(type)) {
        for (const property of homogeneousProperties) {
          const local = properties.filter(child => relation(child) === property)
          if (isCollectionClass(type) && (local.length > 1 || local.some(child => Array.isArray(child.value)))) {
            report(location, 'homogeneous', `${property} has maximum cardinality one on an observation collection.`)
          }
          for (const child of local) {
            const shared = inherited.get(property)
            if (shared && sharedValue(shared) !== sharedValue(child)) {
              report(child, 'homogeneous', `${property} conflicts with the shared value at ${shared.path}.`)
            } else effective.set(property, child)
          }
        }
      }
      const members = properties.filter(child => relation(child) === 'http://www.w3.org/ns/sosa/hasMember')
      if (isCollectionClass(type)) {
        if (!members.some(child => !Array.isArray(child.value) || child.value.length > 0)) {
          report(location, 'membership', 'An observation collection must have at least one member.')
        }
        for (const child of properties) {
          if (['http://www.w3.org/ns/sosa/hasResult', 'http://www.w3.org/ns/sosa/hasSimpleResult'].includes(String(relation(child)))) {
            report(child, 'membership', 'A member result cannot be declared on its collection.')
          }
        }
      }
      for (const child of properties) {
        if (members.includes(child)) {
          const definition = registry.resolve(child.schema.items ? schemaObject(child.schema.items) : child.schema)
          const definitions = Array.isArray(definition.oneOf) ? definition.oneOf.map(schemaObject) : [definition]
          if (definitions.some(member => !isObservationClass(String(member['x-jsonld-type'])))) {
            report(child, 'membership', 'Collection members must be Observations or ObservationCollections, not physical Samples or other entities.')
          }
          visit(child, effective, localScope)
        } else visit(child, undefined, localScope)
      }
    }

    const indexIdentities = (location: ValueLocation): void => {
      const node = registry.resolve(location.schema)
      if (Array.isArray(location.value)) {
        if (!node.items) throw new Error(`Missing item schema at ${location.path}`)
        location.value.forEach((value, index) => indexIdentities({
          value, schema: schemaObject(node.items), path: `${location.path}/${index}`,
        }))
      } else if (isObject(location.value)) {
        const id = location.value['@id']
        if (typeof id === 'string') {
          const previous = identities.get(id)
          if (previous && canonical(previous.value, false) !== canonical(location.value, false)) {
            report(location, 'identity', `Conflicting definitions of ${id}; first declared at ${previous.path}.`)
          } else identities.set(id, { ...location, schema: node })
        }
        for (const [key, child] of Object.entries(node.properties ?? {})) {
          if (Object.hasOwn(location.value, key)) indexIdentities({
            value: location.value[key], schema: schemaObject(child), path: `${location.path}/${pointerToken(key)}`,
          })
        }
      }
    }
    const root = { schema, value: data, path: '' }
    indexIdentities(root)
    visit(root)
    return errors
  }
}
