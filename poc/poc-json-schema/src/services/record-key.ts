import type { JsonSchemaObject } from '../models/json-schema.js'
import type { ReferenceRecord } from './semantic-validator.js'
import { sourceSelection } from './reference-dependency.js'
import { SchemaRegistry, schemaObject } from './schema-registry.js'
import { selectMemberVariant } from './member-layout.js'

export interface ReportingDocument {
  schema: JsonSchemaObject
  data: unknown
  year: number
  dependencies?: JsonSchemaObject[]
}

export interface ReportingRecord {
  reference: ReferenceRecord
  schema: JsonSchemaObject
  data: Record<string, unknown>
  document: ReportingDocument
}

export function reportReferenceTypes(schema: JsonSchemaObject, dependencies: JsonSchemaObject[] = []): Set<string> {
  const registry = new SchemaRegistry(schema, dependencies.filter(dependency => dependency.$id !== schema.$id))
  const types = new Set<string>()
  const visited = new Set<JsonSchemaObject>()
  const visit = (input: JsonSchemaObject): void => {
    const node = registry.resolve(input)
    if (visited.has(node)) return
    visited.add(node)
    if (node['x-reference-records']) {
      const targets = node['x-reference-types']
      if (!Array.isArray(targets) || !targets.every((target): target is string => typeof target === 'string')) {
        throw new Error('Reported-record selections require their source types.')
      }
      for (const target of targets) types.add(target)
    }
    for (const child of Object.values(node.properties ?? {})) visit(schemaObject(child))
    if (node.items) visit(schemaObject(node.items))
    for (const variant of Array.isArray(node.oneOf) ? node.oneOf : []) visit(schemaObject(variant))
  }
  visit(schema)
  return types
}

function scalarKey(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    throw new Error('Key values must be scalar.')
  }
  if (typeof value === 'string' && !value.trim()) throw new Error('Key values cannot be empty.')
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Key values must be finite.')
  return JSON.stringify([typeof value, value])
}

export function canonicalKeyPart(value: unknown, multiple = false): string {
  if (!multiple) return scalarKey(value)
  if (!Array.isArray(value) || !value.length) throw new Error('Key arrays cannot be missing or empty.')
  const parts = value.map(scalarKey)
  if (new Set(parts).size !== parts.length) throw new Error('Key arrays cannot contain duplicate elements.')
  return JSON.stringify(parts.sort())
}

function keySelections(
  schema: JsonSchemaObject, value: unknown, resolve: (schema: JsonSchemaObject) => JsonSchemaObject,
) {
  const key = schema['x-table-key']
  if (!Array.isArray(key) || !key.length || !key.every((part): part is string => typeof part === 'string') ||
      new Set(key).size !== key.length) throw new Error('Invalid source-declared record key.')
  return key.map(source => sourceSelection(source, [{ schema, value }], resolve))
}

export function recordKey(
  schema: JsonSchemaObject, value: unknown,
  resolve: (schema: JsonSchemaObject) => JsonSchemaObject = schema => schema,
): string {
  return JSON.stringify(keySelections(schema, value, resolve).map(selection =>
    canonicalKeyPart(selection.value, Array.isArray(selection.value))))
}

export function reportingRecordId(
  schema: JsonSchemaObject, value: unknown, year: number,
  resolve: (schema: JsonSchemaObject) => JsonSchemaObject = schema => schema,
): string {
  const source = schema['x-source-concept']
  if (typeof source !== 'string' || !source || !Number.isInteger(year) || year < 1 || year > 9998) {
    throw new Error('A reporting key requires its source concept and reporting year.')
  }
  return `urn:riepr:record:${encodeURIComponent(source)}:${year}:${encodeURIComponent(recordKey(schema, value, resolve))}`
}

export function reportingRecords(
  documents: ReportingDocument[], references: ReferenceRecord[] = [],
): ReportingRecord[] {
  const records: ReportingRecord[] = []
  const ids = new Set<string>()
  const labels = new Map(references.map(reference => [reference.id, reference.label]))
  for (const document of documents) {
    const registry = new SchemaRegistry(document.schema, document.dependencies)
    const resolve = (schema: JsonSchemaObject) => registry.resolve(schema)
    const visit = (input: JsonSchemaObject, value: unknown): void => {
      const schema = selectMemberVariant(resolve(input), value)
      if (Array.isArray(value)) {
        if (!schema.items) throw new Error('A reporting array requires an item schema.')
        for (const item of value) visit(schemaObject(schema.items), item)
        return
      }
      if (!value || typeof value !== 'object') return
      if (schema['x-table-key'] !== undefined) {
        const id = reportingRecordId(schema, value, document.year, resolve)
        if (ids.has(id)) throw new Error(`Duplicate reporting key: ${id}`)
        ids.add(id)
        const selections = keySelections(schema, value, resolve)
        const relations: Record<string, string[]> = {}
        const parts = selections.map(selection => {
          const definition = resolve(selection.schema)
          const values = Array.isArray(selection.value) ? selection.value : [selection.value]
          if (definition['x-reference-types'] || (definition.items &&
              resolve(schemaObject(definition.items))['x-reference-types'])) {
            if (!values.every((item): item is string => typeof item === 'string')) {
              throw new Error('Reference key components must contain IRIs.')
            }
            const mapping = definition['x-feature-mapping']
            const predicate = definition['x-jsonld-id'] ??
              (mapping && typeof mapping === 'object' && !Array.isArray(mapping) ? Reflect.get(mapping, 'relation') : undefined)
            if (typeof predicate !== 'string') throw new Error('A reference key component requires its relation.')
            relations[predicate] = [...new Set([...(relations[predicate] ?? []), ...values])]
            return values.map(item => labels.get(item) ?? item).sort().join(', ')
          }
          return values.map(String).sort().join(', ')
        })
        const source = schema['x-source-concept']
        if (typeof source !== 'string') throw new Error('A reporting record requires its source concept.')
        records.push({
          reference: { id, label: `${schema.title ?? source}: ${parts.join(' — ')}`, types: [source],
            year: document.year, relations },
          schema, data: schemaObject(value), document,
        })
      }
      for (const [key, child] of Object.entries(schema.properties ?? {})) {
        if (Object.hasOwn(value, key)) visit(schemaObject(child), Reflect.get(value, key))
      }
    }
    visit(document.schema, document.data)
  }
  return records
}
