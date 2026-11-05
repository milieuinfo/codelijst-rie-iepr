import { type JsonSchemaObject, type ReferenceRecord, SchemaRegistry, schemaObject } from 'codelijst-rie-iepr-poc-json-schema/browser'
import type { CodelistResult } from '../models/index.js'
import { CSOR } from './csor.js'
import { expandUri } from './uri.js'
import { getMockInstances } from './mock-data.service.js'

export class SchemaLookups {
  private readonly labels = new Map<string, string>()
  private readonly ids = new Map<string, string>()

  constructor(readonly result: CodelistResult) {
    for (const concept of result.concepts.values()) {
      const uri = expandUri(result, concept.id) ?? concept.id
      this.labels.set(uri, concept.prefLabel || concept.id)
      this.ids.set(uri, concept.id)
    }
    for (const [id, concept] of Object.entries(CSOR)) {
      this.labels.set(expandUri(result, id) ?? id, id.startsWith('csor_eenheid:') ? concept.symbol || concept.label : concept.label)
    }
  }

  label = (value: unknown): string => this.labels.get(String(value)) ?? String(value)

  references(schema: JsonSchemaObject, dependencies: JsonSchemaObject[], year: number): ReferenceRecord[] {
    const registry = new SchemaRegistry(schema, dependencies)
    const references = new Map<string, ReferenceRecord>()
    const visited = new Set<JsonSchemaObject>()
    const walk = (node: JsonSchemaObject) => {
      if (visited.has(node)) return
      visited.add(node)
      const resolved = registry.resolve(node)
      const types = resolved['x-reference-types']
      if (types !== undefined) {
        if (!Array.isArray(types) || !types.every(type => typeof type === 'string')) throw new Error('Ongeldige structurele referentietypes.')
        for (const type of types) {
          const id = this.ids.get(type) ?? Object.entries(this.result.prefixes)
            .filter(([, base]) => type.startsWith(base)).sort((left, right) => right[1].length - left[1].length)
            .map(([prefix, base]) => prefix + ':' + type.slice(base.length))[0] ?? type
          for (const instance of getMockInstances(id, this.label(type))) {
            const uri = expandUri(this.result, instance.id) ?? instance.id
            const existing = references.get(uri)
            const reference = { id: uri, label: instance.label, types: [...new Set([...(existing?.types ?? []), type])], year }
            references.set(uri, reference)
            this.labels.set(uri, instance.label)
          }
        }
      }
      for (const child of Object.values(resolved.properties ?? {})) walk(schemaObject(child))
      if (resolved.items) walk(schemaObject(resolved.items))
    }
    walk(schema)
    return [...references.values()]
  }
}
