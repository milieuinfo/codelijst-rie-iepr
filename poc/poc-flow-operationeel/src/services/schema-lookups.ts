import { type JsonSchemaObject, type ReferenceRecord, SchemaRegistry, schemaObject, presentationSchema, parseReferenceData, referenceMatchesSchema } from 'codelijst-rie-iepr-poc-json-schema/browser'
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

  references(schema: JsonSchemaObject, dependencies: JsonSchemaObject[], year: number, reported: ReferenceRecord[] = []): ReferenceRecord[] {
    const input = presentationSchema(schema)
    const registry = new SchemaRegistry(input, dependencies.filter(dependency => dependency.$id !== schema.$id))
    const selections: JsonSchemaObject[] = []
    const visited = new Set<JsonSchemaObject>()
    const walk = (node: JsonSchemaObject) => {
      if (visited.has(node)) return
      visited.add(node)
      const resolved = registry.resolve(node)
      const requiredTypes = resolved['x-reference-types']
      if (requiredTypes !== undefined) {
        if (!Array.isArray(requiredTypes) || !requiredTypes.every(type => typeof type === 'string')) throw new Error('Ongeldige structurele referentietypes.')
        if (resolved.type !== 'array') selections.push(resolved)
      }
      for (const child of Object.values(resolved.properties ?? {})) walk(schemaObject(child))
      if (resolved.items) walk(schemaObject(resolved.items))
    }
    walk(input)
    const all = parseReferenceData([...demonstrationReferences, ...reported])
    const choices = all.filter(reference => selections.some(node => referenceMatchesSchema(reference, node, all)))
    const supporting = new Set(choices.flatMap(reference => Object.values(reference.relations ?? {}).flat()))
    const references = all.filter(reference => choices.includes(reference) || supporting.has(reference.id))
      .map(reference => ({ ...reference, year }))
    for (const node of selections) {
      if (!node['x-reference-records'] && !choices.some(reference => referenceMatchesSchema(reference, node, all))) {
        const group = node['x-reference-types']
        if (!Array.isArray(group)) throw new Error('Ongeldige structurele referentietypes.')
        throw new Error(`Geen gedeelde demonstratiegegevens voor ${group.map(this.label).join(' / ')}.`)
      }
    }
    for (const reference of references) this.labels.set(reference.id, reference.label)
    return references
  }
}
