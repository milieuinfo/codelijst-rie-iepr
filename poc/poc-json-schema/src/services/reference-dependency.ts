import type { JsonSchemaObject } from '../models/json-schema.js'
import type { ReferenceRecord } from './semantic-validator.js'
import { schemaObject } from './schema-registry.js'
import { presentationSchema, transformMemberData } from './member-layout.js'

export interface ReferenceDependency { sourceConcept: string; relation: string }
export interface ReferenceScope { schema: JsonSchemaObject; value: unknown }

export function referenceDependency(schema: JsonSchemaObject): ReferenceDependency | undefined {
  const value = schema['x-reference-dependency']
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !('sourceConcept' in value) || typeof value.sourceConcept !== 'string' ||
      !('relation' in value) || typeof value.relation !== 'string' ||
      !value.sourceConcept || !value.relation) throw new Error('Invalid x-reference-dependency.')
  return { sourceConcept: value.sourceConcept, relation: value.relation }
}

/** Search singleton context only; another repeated record cannot supply the parent. */
export function dependencySelections(
  dependency: ReferenceDependency, scopes: ReferenceScope[],
  resolve: (schema: JsonSchemaObject) => JsonSchemaObject = schema => schema,
): string[] {
  for (const scope of scopes) {
    const matches: unknown[] = []
    const visit = (input: JsonSchemaObject, value: unknown): void => {
      let schema = resolve(input)
      if (schema['x-property-layout'] || schema['x-member-layout']) {
        value = transformMemberData(schema, value, 'presentation')
        schema = presentationSchema(schema)
      }
      if (schema['x-source-concept'] === dependency.sourceConcept) {
        const path = schema['x-value-path']
        if (path !== undefined) {
          if (!Array.isArray(path) || !path.every(key => typeof key === 'string')) throw new Error('Invalid x-value-path.')
          for (const key of path) value = value && typeof value === 'object' ? Reflect.get(value, key) : undefined
        }
        matches.push(value)
        return
      }
      if (schema.type !== 'object') return
      for (const [key, child] of Object.entries(schema.properties ?? {})) {
        visit(schemaObject(child), value && typeof value === 'object' ? Reflect.get(value, key) : undefined)
      }
    }
    visit(scope.schema, scope.value)
    if (matches.length > 1) throw new Error(`Ambiguous reference parent ${dependency.sourceConcept}.`)
    if (matches.length) {
      const value = matches[0]
      if (value === undefined) return []
      const values = Array.isArray(value) ? value : [value]
      if (!values.every(item => typeof item === 'string')) throw new Error(`Invalid reference parent ${dependency.sourceConcept}.`)
      return values
    }
  }
  throw new Error(`Unresolved reference parent ${dependency.sourceConcept}.`)
}

export function referenceMatchesDependency(reference: ReferenceRecord, dependency: ReferenceDependency, selected: string[]): boolean {
  return !!selected.length && !!reference.relations?.[dependency.relation]?.some(parent => selected.includes(parent))
}
