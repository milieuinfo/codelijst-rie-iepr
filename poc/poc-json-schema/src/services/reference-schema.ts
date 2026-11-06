import type { JsonSchemaObject } from '../models/json-schema.js'
import type { ReferenceContext, ReferenceRecord } from './semantic-validator.js'
import { SchemaRegistry, schemaObject } from './schema-registry.js'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import { referenceDependency } from './reference-dependency.js'

export interface ReferenceSnapshot {
  genericSchemaId: string
  references: ReferenceRecord[]
  referenceContext: ReferenceContext
}

function parseRelations(value: unknown): Record<string, string[]> {
  const object = schemaObject(value)
  const output: Record<string, string[]> = {}
  for (const [relation, targets] of Object.entries(object)) {
    if (!relation || !Array.isArray(targets) || !targets.every((id): id is string => typeof id === 'string' && !!id)) {
      throw new Error('Invalid reference relationships.')
    }
    Object.defineProperty(output, relation, { value: [...targets], enumerable: true })
  }
  return output
}

function dependencyConstraints(node: JsonSchemaObject, references: ReferenceRecord[]): void {
  const fields: { path: string[]; schema: JsonSchemaObject; source?: unknown }[] = []
  const collect = (schema: JsonSchemaObject, path: string[]): void => {
    if (schema['x-source-concept'] && (schema['x-reference-types'] ||
        (schema.items && schemaObject(schema.items)['x-reference-types']))) {
      const source = schema['x-source-concept']
      const valuePath = schema['x-value-path']
      if (valuePath !== undefined) {
        if (!Array.isArray(valuePath) || !valuePath.every((key): key is string => typeof key === 'string')) throw new Error('Invalid x-value-path.')
        for (const key of valuePath) schema = schemaObject(schema.properties?.[key])
        path = [...path, ...valuePath]
      }
      fields.push({ path, schema, source })
      return
    }
    if (schema.type === 'object') for (const [key, child] of Object.entries(schema.properties ?? {})) {
      collect(schemaObject(child), [...path, key])
    }
  }
  collect(node, [])
  const at = (path: string[], rule: JsonSchemaObject): JsonSchemaObject =>
    path.reduceRight<JsonSchemaObject>((child, key) => ({ required: [key], properties: { [key]: child } }), rule)
  for (const field of fields) {
    const definition = field.schema.type === 'array' ? schemaObject(field.schema.items) : field.schema
    const dependency = referenceDependency(definition)
    if (!dependency) continue
    const parents = fields.filter(candidate => candidate.source === dependency.sourceConcept)
    if (parents.length > 1) throw new Error(`Ambiguous reference parent ${dependency.sourceConcept}.`)
    const parent = parents[0]
    if (!parent) continue // An enclosing singleton/record owns the parent.
    const rules = references.filter(reference => definition.enum?.includes(reference.id)).map(reference => {
      const targets = reference.relations?.[dependency.relation] ?? []
      const selected: JsonSchemaObject = { const: reference.id }
      const allowed: JsonSchemaObject = targets.length ? { enum: targets } : { not: {} }
      return {
        if: at(field.path, field.schema.type === 'array' ? { contains: selected } : selected),
        then: at(parent.path, parent.schema.type === 'array' ? { contains: allowed } : allowed),
      }
    })
    node.allOf = [...(node.allOf ?? []), ...rules]
  }
}

export function parseReferenceData(value: unknown): ReferenceRecord[] {
  if (!Array.isArray(value)) throw new Error('Reference data must be an array.')
  const ids = new Set<string>()
  return value.map(value => {
    const record = schemaObject(value)
    if (typeof record.id !== 'string' || !record.id || typeof record.label !== 'string' || !record.label ||
        !Array.isArray(record.types) || !record.types.length || !record.types.every(type => typeof type === 'string' && type) ||
        (record.parents !== undefined && (!Array.isArray(record.parents) || !record.parents.every(id => typeof id === 'string' && id))) ||
        (record.year !== undefined && !Number.isInteger(record.year))) throw new Error('Invalid reference-data record.')
    if (ids.has(record.id)) throw new Error(`Duplicate reference-data identity: ${record.id}`)
    ids.add(record.id)
    return {
      id: record.id, label: record.label, types: [...record.types],
      ...(record.parents !== undefined ? { parents: [...record.parents] } : {}),
      ...(record.relations !== undefined ? { relations: parseRelations(record.relations) } : {}),
      ...(record.year !== undefined ? { year: Number(record.year) } : {}),
    }
  })
}

export function parseReferenceContext(value: unknown): ReferenceContext {
  const context = schemaObject(value)
  if (Object.keys(context).some(key => !['year', 'ids'].includes(key)) ||
      (context.year !== undefined && !Number.isInteger(context.year)) ||
      (context.ids !== undefined && (!Array.isArray(context.ids) || !context.ids.every(id => typeof id === 'string' && id)))) {
    throw new Error('Invalid reference context.')
  }
  return {
    ...(context.year !== undefined ? { year: Number(context.year) } : {}),
    ...(context.ids !== undefined ? { ids: [...context.ids] } : {}),
  }
}

export function referenceSnapshot(schema: JsonSchemaObject): ReferenceSnapshot | undefined {
  if (schema['x-reference-snapshot'] === undefined) return undefined
  const snapshot = schemaObject(schema['x-reference-snapshot'])
  if (typeof snapshot.genericSchemaId !== 'string' || !snapshot.genericSchemaId) throw new Error('Invalid generic schema identity.')
  return {
    genericSchemaId: snapshot.genericSchemaId,
    references: parseReferenceData(snapshot.references),
    referenceContext: parseReferenceContext(snapshot.referenceContext),
  }
}

/** Specialize external selections without changing the generic reporting contract. */
export function personalizeReferenceSchema(
  schema: JsonSchemaObject,
  options: { references: ReferenceRecord[]; referenceContext?: ReferenceContext; dependencies?: JsonSchemaObject[] },
): JsonSchemaObject {
  if (!schema.$id) throw new Error('Personalization requires a schema $id.')
  if (referenceSnapshot(schema)) throw new Error('Expected a generic schema, not an already personalized schema.')
  const references = parseReferenceData(options.references).sort((a, b) => a.id.localeCompare(b.id))
  const context = parseReferenceContext(options.referenceContext ?? {})
  const registry = new SchemaRegistry(schema, (options.dependencies ?? []).filter(dependency => dependency.$id !== schema.$id))
  const used = new Set<string>()
  const candidates = (node: JsonSchemaObject): ReferenceRecord[] | undefined => {
    const types = node['x-reference-types']
    if (types === undefined) return undefined
    if (node.type === 'array' || (node.type === 'object' && Array.isArray(node['x-value-path']))) return undefined
    if (node.type !== 'string' || !Array.isArray(types) || !types.length || !types.every(type => typeof type === 'string')) {
      throw new Error('Reference selections must be strings with declared reference types.')
    }
    return references.filter(reference => reference.types.some(type => types.includes(type)) &&
      (reference.year === undefined || reference.year === context.year) &&
      (!node.enum || node.enum.includes(reference.id)) &&
      (node.const === undefined || node.const === reference.id))
  }
  const active = new Set<JsonSchemaObject>()
  const visit = (input: JsonSchemaObject, inherited: Set<string>): JsonSchemaObject => {
    if (active.has(input)) throw new Error('Recursive schemas cannot be specialized into a finite reference snapshot.')
    active.add(input)
    const resolved = registry.resolve(input)
    if (resolved.$dynamicRef || resolved.$recursiveRef) throw new Error('Dynamic schema references cannot be personalized.')
    const node = structuredClone(resolved)
    delete node.$ref
    // Schema definitions are inlined at their use sites, where parent context is known.
    delete node.$defs
    delete node.definitions
    delete node.$id
    delete node.$anchor
    const scope = new Set(inherited)
    const local = Object.values(resolved.properties ?? {}).flatMap(child => {
      const property = registry.resolve(schemaObject(child))
      const definition = property.items ? registry.resolve(schemaObject(property.items)) : property
      return candidates(definition) ?? []
    })
    let allowed = local
    let changed = true
    while (changed) {
      const possible = new Set([...inherited, ...allowed.map(reference => reference.id)])
      const next = allowed.filter(reference => !reference.parents?.length || reference.parents.some(parent => possible.has(parent)))
      changed = next.length !== allowed.length
      allowed = next
    }
    allowed.forEach(reference => scope.add(reference.id))
    const dependency = referenceDependency(resolved)
    const choices = candidates(resolved)?.filter(reference => dependency
      ? !!reference.relations?.[dependency.relation]?.length
      : !reference.parents?.length || reference.parents.some(parent => scope.has(parent)))
    if (choices) {
      choices.forEach(reference => used.add(reference.id))
      node['x-reference-options'] = choices.map(({ id, label }) => ({ id, label }))
      if (choices.length) node.enum = choices.map(reference => reference.id)
      else {
        delete node.enum
        node.not = {}
      }
    }
    for (const key of ['properties', 'patternProperties', 'dependentSchemas']) {
      const children = resolved[key]
      if (children && typeof children === 'object' && !Array.isArray(children)) {
        node[key] = Object.fromEntries(Object.entries(children).map(([name, child]) =>
          [name, typeof child === 'boolean' ? child : visit(schemaObject(child), scope)]))
      }
    }
    for (const key of ['items', 'contains', 'not', 'if', 'then', 'else', 'additionalProperties', 'propertyNames', 'unevaluatedProperties']) {
      const child = resolved[key]
      if (child && typeof child === 'object') node[key] = visit(schemaObject(child), scope)
    }
    for (const key of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
      const children = resolved[key]
      if (Array.isArray(children)) node[key] = children.map(child =>
        typeof child === 'boolean' ? child : visit(schemaObject(child), scope))
    }
    if (choices?.length === 0) node.not = {}
    if (node.type === 'object') dependencyConstraints(node, references)
    active.delete(input)
    return node
  }
  const personalized = visit(schema, new Set(context.ids ?? []))
  personalized['x-reference-snapshot'] = {
    genericSchemaId: schema.$id,
    referenceContext: context,
    references: references.filter(reference => used.has(reference.id)),
  } satisfies ReferenceSnapshot
  const id = new URL(schema.$id)
  id.hash = ''
  id.searchParams.set('reference-profile', 'personalized')
  if (context.year !== undefined) id.searchParams.set('year', String(context.year))
  id.searchParams.set('reference-snapshot', bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(personalized)))))
  personalized.$id = id.href
  return personalized
}
