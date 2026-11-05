import type { JsonSchemaObject } from '../models/index.js'

export function schemaObject(value: unknown): JsonSchemaObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected a JSON Schema object in the supported reporting-schema subset.')
  }
  return value as JsonSchemaObject
}

export function pointerToken(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1')
}

/** Explicit, offline resources only. Never fetch a missing reference from the network. */
export class SchemaRegistry {
  private readonly resources = new Map<string, JsonSchemaObject>()
  private readonly bases = new WeakMap<JsonSchemaObject, string>()
  private readonly locations = new WeakMap<JsonSchemaObject, { documentId: string; pointer: string }>()

  constructor(root: JsonSchemaObject, dependencies: JsonSchemaObject[] = []) {
    for (const document of [root, ...dependencies]) {
      if (this.bases.has(document)) continue
      this.register(document, document.$id ?? 'urn:riepr:inline-schema', true)
    }
  }

  resolve(schema: JsonSchemaObject): JsonSchemaObject {
    const active = new Set<JsonSchemaObject>()
    const dereference = (node: JsonSchemaObject): JsonSchemaObject => {
      if (!node.$ref) return node
      if (typeof node.$ref !== 'string') throw new Error('Schema $ref must be a string.')
      if (active.has(node)) throw new Error(`Cyclic reference without a record boundary: ${node.$ref}`)
      active.add(node)
      const base = this.bases.get(node)
      if (!base) throw new Error(`Unregistered schema reference: ${node.$ref}`)
      const uri = new URL(node.$ref, base)
      const exact = this.resources.get(uri.href)
      let target: unknown = exact
      if (!exact) {
        const fragment = decodeURIComponent(uri.hash.slice(1))
        uri.hash = ''
        target = this.resources.get(uri.href)
        if (!target) throw new Error(`Unresolved offline schema reference: ${uri.href}`)
        if (fragment && !fragment.startsWith('/')) throw new Error(`Unresolved schema anchor: ${fragment}`)
        for (const token of fragment ? fragment.slice(1).split('/') : []) {
          if (/~(?:[^01]|$)/.test(token)) throw new Error(`Invalid schema JSON Pointer: ${node.$ref}`)
          const key = token.replace(/~1/g, '/').replace(/~0/g, '~')
          if (!target || typeof target !== 'object' || !Object.hasOwn(target, key)) {
            throw new Error(`Unresolved schema JSON Pointer: ${node.$ref}`)
          }
          target = Reflect.get(target, key)
        }
      }
      const resolved = dereference(schemaObject(target))
      const { $ref, ...siblings } = node
      for (const key of Object.keys(siblings)) {
        if (key in resolved && !key.startsWith('x-') && !['title', 'description', '$id', '$schema'].includes(key) &&
            JSON.stringify(siblings[key]) !== JSON.stringify(resolved[key])) {
          throw new Error(`Unsupported intersecting $ref sibling "${key}" in ${$ref}.`)
        }
      }
      active.delete(node)
      const merged = { ...resolved, ...siblings }
      this.bases.set(merged, this.bases.get(resolved) ?? base)
      this.locations.set(merged, this.location(resolved))
      return merged
    }
    return dereference(schema)
  }

  location(schema: JsonSchemaObject): { documentId: string; pointer: string } {
    const location = this.locations.get(schema)
    if (!location) throw new Error('Unregistered schema location.')
    return location
  }

  private register(schema: JsonSchemaObject, parentBase: string, root = false, pointer = ''): void {
    const base = schema.$id ? new URL(schema.$id, parentBase).href : parentBase
    if (schema.$id) pointer = ''
    this.bases.set(schema, base)
    this.locations.set(schema, { documentId: base.split('#')[0], pointer })
    if (root || schema.$id) this.resource(base, schema)
    if (typeof schema.$anchor === 'string') this.resource(`${base.split('#')[0]}#${schema.$anchor}`, schema)
    for (const key of ['properties', '$defs', 'definitions', 'dependentSchemas']) {
      const children = schema[key]
      if (children && typeof children === 'object' && !Array.isArray(children)) {
        for (const [name, child] of Object.entries(children)) {
          if (typeof child !== 'boolean') this.register(schemaObject(child), base, false, `${pointer}/${key}/${pointerToken(name)}`)
        }
      }
    }
    for (const key of ['items', 'contains', 'not', 'if', 'then', 'else', 'additionalProperties', 'propertyNames']) {
      const child = schema[key]
      if (child && typeof child === 'object') this.register(schemaObject(child), base, false, `${pointer}/${key}`)
    }
    for (const key of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
      const children = schema[key]
      if (Array.isArray(children)) {
        children.forEach((child, index) => {
          if (typeof child !== 'boolean') this.register(schemaObject(child), base, false, `${pointer}/${key}/${index}`)
        })
      }
    }
  }

  private resource(id: string, schema: JsonSchemaObject): void {
    const previous = this.resources.get(id)
    if (previous && previous !== schema) throw new Error(`Duplicate offline schema identity: ${id}`)
    this.resources.set(id, schema)
  }
}
