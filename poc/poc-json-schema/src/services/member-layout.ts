import type { JsonSchemaObject } from '../models/json-schema.js'
import { schemaObject } from './schema-registry.js'

interface MemberLayout {
  key: string
  repeatable: boolean
  required: boolean
  annotations: JsonSchemaObject
  unwrapValue?: boolean
}

const memberRelation = 'http://www.w3.org/ns/sosa/hasMember'
const propertyRelation = 'https://schema.org/additionalProperty'
const groups = [
  { key: 'hasMember', discriminator: 'observedProperty', relation: memberRelation, annotation: 'x-member-layout' },
  { key: 'additionalProperty', discriminator: 'propertyID', relation: propertyRelation, annotation: 'x-property-layout' },
]
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export function memberLayouts(node: JsonSchemaObject): MemberLayout[] {
  return readLayouts(node, 'x-member-layout')
}

function readLayouts(node: JsonSchemaObject, annotation: string): MemberLayout[] {
  const layouts = node[annotation]
  if (layouts === undefined) return []
  if (!Array.isArray(layouts)) throw new Error('Invalid member layout.')
  return layouts.map(value => {
    if (!object(value) || typeof value.key !== 'string' || typeof value.repeatable !== 'boolean' ||
      typeof value.required !== 'boolean' || !object(value.annotations)) throw new Error('Invalid member layout entry.')
    return {
      key: value.key, repeatable: value.repeatable, required: value.required, annotations: schemaObject(value.annotations),
      ...(value.unwrapValue === true ? { unwrapValue: true } : {})
    }
  })
}

export function memberVariants(node: JsonSchemaObject): JsonSchemaObject[] {
  return relationVariants(node, 'hasMember')
}

function relationVariants(node: JsonSchemaObject, key: string): JsonSchemaObject[] {
  const variants = schemaObject(node.properties?.[key]).items
  const oneOf = schemaObject(variants).oneOf
  if (!Array.isArray(oneOf)) throw new Error('Missing discriminated member schemas.')
  return oneOf.map(schemaObject)
}

/** Keep predicate arrays canonical while retaining their source-authored input layout. */
export function canonicalMemberSchema(input: JsonSchemaObject): JsonSchemaObject {
  const node = structuredClone(input)
  const visit = (node: JsonSchemaObject): void => {
    for (const child of Object.values(node.properties ?? {})) visit(schemaObject(child))
    if (node.items) visit(schemaObject(node.items))
    for (const group of groups) {
      const members = Object.entries(node.properties ?? {}).filter(([, child]) =>
        schemaObject(child)['x-jsonld-id'] === group.relation)
      if (!members.length) continue
      const constraints = Object.fromEntries(['allOf', 'anyOf', 'dependentRequired'].filter(key => node[key] !== undefined)
        .map(key => [key, structuredClone(node[key])]))
      if (group.key === 'additionalProperty') node['x-property-input-constraints'] = constraints
      const required = new Set(node.required ?? [])
      const layouts: MemberLayout[] = []
      const variants: JsonSchemaObject[] = []
      for (const [key, child] of members) {
        const schema = schemaObject(child)
        const repeatable = schema.type === 'array'
        const { items, ...annotations } = schema
        const variant = repeatable ? schemaObject(items) : schema
        const unwrapValue = group.key === 'additionalProperty' && repeatable &&
          !!variant.properties?.value && !variant.properties?.unitCode
        layouts.push({
          key, repeatable, required: required.has(key), annotations: repeatable ? annotations : {},
          ...(unwrapValue ? { unwrapValue: true } : {})
        })
        const observed = variant.properties?.[group.discriminator]
        if (!observed || (schemaObject(observed).const === undefined && !schemaObject(observed).enum)) {
          throw new Error(`${key} requires a ${group.discriminator} discriminator.`)
        }
        variant.required = [...new Set([...(variant.required ?? []), group.discriminator])]
        variants.push(variant)
        delete node.properties![key]
        required.delete(key)
      }
      const mustExist = group.key === 'hasMember' || layouts.some(layout => layout.required)
      node.properties![group.key] = {
        type: 'array', title: group.key === 'hasMember' ? 'Observaties' : 'Aanvullende eigenschappen', minItems: 1,
        'x-jsonld-id': group.relation,
        items: { oneOf: variants },
        allOf: variants.map((variant, index) => ({
          contains: discriminatorSchema(variant, group.discriminator),
          minContains: layouts[index].required ? (layouts[index].annotations.minItems ?? 1) : 0,
          ...(!layouts[index].repeatable ? { maxContains: 1 }
            : layouts[index].annotations.maxItems === undefined ? {} : { maxContains: layouts[index].annotations.maxItems }),
        })),
      }
      if (mustExist) required.add(group.key)
      node.required = [...required]
      if (group.key === 'hasMember') delete node.anyOf
      else {
        const rewritten = rewritePropertyConstraints(constraints, layouts, variants)
        for (const key of Object.keys(constraints)) node[key] = rewritten[key]
      }
      node[group.annotation] = layouts
    }
  }
  visit(node)
  return node
}

function discriminatorSchema(variant: JsonSchemaObject, key: string): JsonSchemaObject {
  return { type: 'object', required: [key], properties: { [key]: variant.properties![key] } }
}

function rewritePropertyConstraints(
  input: JsonSchemaObject, layouts: MemberLayout[], variants: JsonSchemaObject[],
): JsonSchemaObject {
  const visit = (rule: JsonSchemaObject): JsonSchemaObject => {
    const output = { ...rule }
    for (const key of ['if', 'then', 'else', 'not']) if (object(rule[key])) output[key] = visit(schemaObject(rule[key]))
    for (const key of ['allOf', 'anyOf', 'oneOf']) {
      if (Array.isArray(rule[key])) output[key] = rule[key].map(value => visit(schemaObject(value)))
    }
    const checks: JsonSchemaObject[] = []
    const required = new Set(rule.required ?? [])
    const properties = { ...rule.properties }
    layouts.forEach((layout, index) => {
      const constraint = properties[layout.key]
      if (constraint !== undefined) {
        delete properties[layout.key]
        checks.push({
          properties: {
            additionalProperty: {
              items: { if: discriminatorSchema(variants[index], 'propertyID'), then: schemaObject(constraint) },
            }
          }
        })
      }
      if (required.delete(layout.key)) checks.push({
        required: ['additionalProperty'], properties: {
          additionalProperty: {
            contains: discriminatorSchema(variants[index], 'propertyID'), minContains: 1,
          }
        },
      })
    })
    if (rule.properties) output.properties = properties
    if (rule.required) output.required = [...required]
    if (checks.length) output.allOf = [...(output.allOf ?? []), ...checks]
    return output
  }
  return visit(input)
}

export function presentationSchema(input: JsonSchemaObject): JsonSchemaObject {
  const node = structuredClone(input)
  const visit = (node: JsonSchemaObject): void => {
    for (const group of groups) {
      const layouts = readLayouts(node, group.annotation)
      if (layouts.length) {
        const variants = relationVariants(node, group.key)
        delete node.properties![group.key]
        node.required = (node.required ?? []).filter(key => key !== group.key)
        layouts.forEach((layout, index) => {
          node.properties![layout.key] = layout.repeatable
            ? { ...layout.annotations, items: layout.unwrapValue ? variants[index].properties!.value : variants[index] }
            : variants[index]
          if (layout.required) node.required!.push(layout.key)
        })
        if (group.key === 'hasMember') node.anyOf = layouts.map(layout => ({
          required: [layout.key],
          ...(layout.repeatable ? { properties: { [layout.key]: { minItems: 1 } } } : {}),
        }))
        if (group.key === 'additionalProperty') {
          for (const key of ['allOf', 'anyOf', 'dependentRequired']) delete node[key]
          Object.assign(node, node['x-property-input-constraints'])
          delete node['x-property-input-constraints']
        }
        delete node[group.annotation]
      }
    }
    for (const child of Object.values(node.properties ?? {})) visit(schemaObject(child))
    if (node.items) visit(schemaObject(node.items))
  }
  visit(node)
  return node
}

export function matchingMemberVariant(node: JsonSchemaObject, value: unknown): JsonSchemaObject | undefined {
  if (!Array.isArray(node.oneOf)) return node
  if (!object(value)) return undefined
  const candidates = node.oneOf.map(schemaObject).filter(variant => {
    const key = variant.properties?.observedProperty ? 'observedProperty' : 'propertyID'
    const observed = variant.properties?.[key]
    if (!observed) return false
    const discriminator = schemaObject(observed)
    return discriminator.const !== undefined ? discriminator.const === value[key]
      : discriminator.enum?.includes(value[key])
  })
  return candidates.length === 1 ? candidates[0] : undefined
}

export function selectMemberVariant(node: JsonSchemaObject, value: unknown): JsonSchemaObject {
  const variant = matchingMemberVariant(node, value)
  if (variant) return variant
  if (!object(value)) throw new Error('An observation member must be an object.')
  throw new Error(`Unknown or ambiguous observedProperty/propertyID: ${String(value.observedProperty ?? value.propertyID)}.`)
}

export function transformMemberData(schema: JsonSchemaObject, data: unknown, direction: 'canonical' | 'presentation'): unknown {
  const visit = (node: JsonSchemaObject, value: unknown): unknown => {
    if (node.type === 'array' && Array.isArray(value)) return value.map(item => visit(schemaObject(node.items), item))
    if (!object(value)) return value
    const output = { ...value }
    const grouped = groups.filter(group => readLayouts(node, group.annotation).length)
    for (const group of grouped) {
      const layouts = readLayouts(node, group.annotation)
      const variants = relationVariants(node, group.key)
      if (direction === 'canonical') {
        const members: unknown[] = []
        layouts.forEach((layout, index) => {
          if (!Object.hasOwn(value, layout.key)) return
          const items = layout.repeatable ? value[layout.key] : [value[layout.key]]
          if (!Array.isArray(items)) throw new Error(`Expected member array at ${layout.key}.`)
          members.push(...items.map(item => visit(variants[index], layout.unwrapValue
            ? { propertyID: schemaObject(variants[index].properties!.propertyID).const, value: item } : item)))
          delete output[layout.key]
        })
        if (members.length || Object.hasOwn(value, group.key)) output[group.key] = members
      } else {
        delete output[group.key]
        const members = value[group.key]
        if (members !== undefined) {
          if (!Array.isArray(members)) throw new Error(`${group.key} must be an array.`)
          for (const item of members) {
            const variant = selectMemberVariant(schemaObject(schemaObject(node.properties![group.key]).items), item)
            const index = variants.indexOf(variant)
            const layout = layouts[index]
            const converted = visit(variant, item)
            const child = layout.unwrapValue && object(converted) ? converted.value : converted
            if (layout.repeatable) {
              const entries = output[layout.key] ?? []
              if (!Array.isArray(entries)) throw new Error('Conflicting member representation.')
              entries.push(child)
              output[layout.key] = entries
            } else {
              if (Object.hasOwn(output, layout.key)) throw new Error(`Duplicate singleton ${layout.key}.`)
              output[layout.key] = child
            }
          }
        }
      }
    }
    for (const [key, child] of Object.entries(node.properties ?? {})) {
      if (grouped.some(group => key === group.key)) continue
      if (Object.hasOwn(value, key)) output[key] = visit(schemaObject(child), value[key])
    }
    return output
  }
  return visit(schema, data)
}

export function canonicalDataPath(schema: JsonSchemaObject, data: unknown, path: (string | number)[]): (string | number)[] {
  const walk = (node: JsonSchemaObject, value: unknown, remaining: (string | number)[]): (string | number)[] => {
    if (!remaining.length) return []
    const [key, ...rest] = remaining
    if (node.type === 'array') {
      if (typeof key !== 'number' || !Array.isArray(value)) throw new Error('Invalid presentation array path.')
      return [key, ...walk(schemaObject(node.items), value[key], rest)]
    }
    for (const group of groups) {
      const layouts = readLayouts(node, group.annotation)
      const index = layouts.findIndex(layout => layout.key === key)
      if (index >= 0 && object(value)) {
        const layout = layouts[index]
        const offset = layouts.slice(0, index).reduce((total, entry) => {
          const items = value[entry.key]
          return total + (entry.repeatable ? Array.isArray(items) ? items.length : 0 : Object.hasOwn(value, entry.key) ? 1 : 0)
        }, 0)
        const variant = relationVariants(node, group.key)[index]
        const items = value[key]
        if (layout.repeatable) {
          const [item, ...tail] = rest
          if (typeof item !== 'number' || !Array.isArray(items)) throw new Error('Invalid repeated member path.')
          return [group.key, offset + item, ...(layout.unwrapValue ? ['value', ...tail] : walk(variant, items[item], tail))]
        }
        return [group.key, offset, ...walk(variant, items, rest)]
      }
    }
    return [key, ...walk(schemaObject(node.properties?.[key]), object(value) ? value[key] : undefined, rest)]
  }
  return walk(schema, data, path)
}

export function canonicalRecordPath(schema: JsonSchemaObject, path: string[]): string[] {
  if (!path.length) return []
  const [key, ...rest] = path
  for (const group of groups) {
    const index = readLayouts(schema, group.annotation).findIndex(layout => layout.key === key)
    if (index >= 0) return [group.key, ...canonicalRecordPath(relationVariants(schema, group.key)[index], rest)]
  }
  return [key, ...canonicalRecordPath(schemaObject(schema.properties?.[key]), rest)]
}

export function presentationDataPath(schema: JsonSchemaObject, data: unknown, path: (string | number)[]): (string | number)[] {
  const walk = (node: JsonSchemaObject, value: unknown, remaining: (string | number)[]): (string | number)[] => {
    if (!remaining.length) return []
    const [key, ...rest] = remaining
    if (node.type === 'array' && typeof key === 'number' && Array.isArray(value)) {
      return [key, ...walk(schemaObject(node.items), value[key], rest)]
    }
    for (const group of groups) {
      const layouts = readLayouts(node, group.annotation)
      const members = object(value) ? value[group.key] : undefined
      if (layouts.length && key === group.key && Array.isArray(members)) {
        const [index, ...tail] = rest
        if (typeof index !== 'number' || !members[index]) return remaining
        const union = schemaObject(schemaObject(node.properties![group.key]).items)
        const variant = selectMemberVariant(union, members[index])
        const layout = layouts[relationVariants(node, group.key).indexOf(variant)]
        const itemIndex = members.slice(0, index).filter(item => selectMemberVariant(union, item) === variant).length
        return [
          layout.key, ...(layout.repeatable ? [itemIndex] : []),
          ...(layout.unwrapValue ? tail.filter((key, index) => index !== 0 || key !== 'value') : walk(variant, members[index], tail)),
        ]
      }
    }
    const child = node.properties?.[key]
    return child ? [key, ...walk(schemaObject(child), object(value) ? value[key] : undefined, rest)] : remaining
  }
  return walk(schema, data, path)
}

/** Predicate arrays use a discriminator filter instead of a fixed item index. */
export function canonicalColumnPath(schema: JsonSchemaObject, path: string[]): string {
  const walk = (node: JsonSchemaObject, remaining: string[]): string => {
    if (!remaining.length) return ''
    const [key, ...rest] = remaining
    for (const group of groups) {
      const layouts = readLayouts(node, group.annotation)
      const index = layouts.findIndex(layout => layout.key === key)
      if (index >= 0) {
        const variant = relationVariants(node, group.key)[index]
        const discriminator = schemaObject(variant.properties![group.discriminator])
        const test = discriminator.const !== undefined
          ? `@.${group.discriminator} == ${JSON.stringify(discriminator.const)}`
          : (discriminator.enum ?? []).map(value => `@.${group.discriminator} == ${JSON.stringify(value)}`).join(' || ')
        return `[${JSON.stringify(group.key)}][?(${test})]${layouts[index].unwrapValue ? '["value"]' : ''}${walk(variant, rest)}`
      }
    }
    return `[${JSON.stringify(key)}]${walk(schemaObject(node.properties?.[key]), rest)}`
  }
  return '$' + walk(schema, path)
}
