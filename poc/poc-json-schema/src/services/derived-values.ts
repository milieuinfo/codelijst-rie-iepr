import type { JsonSchemaObject } from '../models/json-schema.js'
import { SchemaRegistry, schemaObject } from './schema-registry.js'
import { memberLayouts, memberVariants, selectMemberVariant } from './member-layout.js'

/** Fill shared source values only inside the same repeated reporting record. */
export function materializeDerivedValues(schema: JsonSchemaObject, data: unknown, dependencies: JsonSchemaObject[] = []): unknown {
  const registry = new SchemaRegistry(schema, dependencies)
  const object = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value)
  const output: unknown = structuredClone(data)
  interface Location { node: JsonSchemaObject; owner: Record<string, unknown>; key: string; scope: string }
  const locations: Location[] = []
  const visit = (input: JsonSchemaObject, value: unknown, scope: string, path: string): void => {
    const node = registry.resolve(input)
    if (node.type === 'array' && Array.isArray(value)) {
      value.forEach((item, index) => visit(schemaObject(node.items), item, `${path}/${index}`, `${path}/${index}`))
    } else if (node.type === 'object' && object(value)) {
      for (const [key, child] of Object.entries(node.properties ?? {})) {
        const definition = registry.resolve(schemaObject(child))
        locations.push({ node: definition, owner: value, key, scope })
        const layouts = memberLayouts(node)
        const members = value[key]
        if (key === 'hasMember' && layouts.length && Array.isArray(members)) {
          members.forEach((member, index) => {
            const variant = selectMemberVariant(schemaObject(definition.items), member)
            const layout = layouts[memberVariants(node).indexOf(variant)]
            const memberPath = `${path}/${key}/${index}`
            visit(variant, member, layout.repeatable ? memberPath : scope, memberPath)
          })
        } else if (Object.hasOwn(value, key)) visit(definition, value[key], scope, `${path}/${key}`)
      }
    }
  }
  visit(schema, output, '', '')
  for (const target of locations) {
    const source = target.node['x-derived-from-source']
    if (typeof source !== 'string') continue
    const candidates = locations.filter(location =>
      location.scope === target.scope && location.node['x-source-concept'] === source &&
      Object.hasOwn(location.owner, location.key))
    if (candidates.length > 1) throw new Error(`Ambiguous shared source value ${source}.`)
    const value = candidates[0]?.owner[candidates[0].key]
    if (value === undefined) continue
    const current = target.owner[target.key]
    if (current !== undefined && JSON.stringify(current) !== JSON.stringify(value)) {
      throw new Error(`Conflicting derived value for ${source}.`)
    }
    target.owner[target.key] = structuredClone(value)
  }
  return output
}
