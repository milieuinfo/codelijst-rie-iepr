import { type JsonSchemaObject, type ReferenceRecord, SchemaRegistry, schemaObject, presentationSchema, parseReferenceData } from 'codelijst-rie-iepr-poc-json-schema/browser'
import type { CodelistResult } from '../models/index.js'
import { CSOR } from './csor.js'
import { expandUri } from './uri.js'
import demonstrationReferences from '../../../poc-json-schema/examples/refs.json'

export class SchemaLookups {
  private readonly labels = new Map<string, string>()

  constructor(readonly result: CodelistResult) {
    for (const concept of result.concepts.values()) {
      const uri = expandUri(result, concept.id) ?? concept.id
      this.labels.set(uri, concept.prefLabel || concept.id)
    }
    for (const [id, concept] of Object.entries(CSOR)) {
      this.labels.set(expandUri(result, id) ?? id, id.startsWith('csor_eenheid:') ? concept.symbol || concept.label : concept.label)
    }
  }

  label = (value: unknown): string => this.labels.get(String(value)) ?? String(value)

  references(schema: JsonSchemaObject, dependencies: JsonSchemaObject[], year: number): ReferenceRecord[] {
    const input = presentationSchema(schema)
    const registry = new SchemaRegistry(input, dependencies.filter(dependency => dependency.$id !== schema.$id))
    const types = new Set<string>()
    const visited = new Set<JsonSchemaObject>()
    const walk = (node: JsonSchemaObject) => {
      if (visited.has(node)) return
      visited.add(node)
      const resolved = registry.resolve(node)
      const requiredTypes = resolved['x-reference-types']
      if (requiredTypes !== undefined) {
        if (!Array.isArray(requiredTypes) || !requiredTypes.every(type => typeof type === 'string')) throw new Error('Ongeldige structurele referentietypes.')
        for (const type of requiredTypes) types.add(type)
      }
      for (const child of Object.values(resolved.properties ?? {})) walk(schemaObject(child))
      if (resolved.items) walk(schemaObject(resolved.items))
    }
    walk(input)
    const references = parseReferenceData(demonstrationReferences)
      .filter(reference => reference.types.some(type => types.has(type)))
      .map(reference => ({ ...reference, year }))
    for (const type of types) {
      if (!references.some(reference => reference.types.includes(type))) {
        throw new Error(`Geen gedeelde demonstratiegegevens voor ${this.label(type)}.`)
      }
    }
    for (const reference of references) this.labels.set(reference.id, reference.label)
    return references
  }
}
