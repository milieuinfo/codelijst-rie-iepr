import type { Concept, CodelistResult, SchemaField } from '../models/index.js'
import { ConceptMapper } from './concept-mapper.js'
import { observationOwnership } from './observation-ownership.js'

export class CompositeGroupBuilder {
  private readonly result: CodelistResult
  private readonly mapper: ConceptMapper

  constructor(result: CodelistResult, mapper: ConceptMapper) {
    this.result = result
    this.mapper = mapper
  }

  buildNestedStructure(fields: SchemaField[]): SchemaField[] {
    fields = observationOwnership(fields, this.result)
    const byId = new Map(fields.map(field => [field.conceptId, field]))
    if (byId.size !== fields.length) throw new Error('Duplicate field ownership in the reporting graph.')
    for (const field of fields) {
      if ((field.broaderPartitive?.length ?? 0) > 1) throw new Error(`Ambiguous ownership of ${field.conceptId}.`)
      const active = new Set<string>()
      let node: SchemaField | undefined = field
      while (node?.broaderPartitive?.length) {
        if (active.has(node.conceptId)) throw new Error(`Ownership cycle at ${node.conceptId}.`)
        active.add(node.conceptId)
        const parent: string = node.broaderPartitive[0]
        node = byId.get(parent)
        if (!node) throw new Error(`Missing parent ${parent} of ${field.conceptId}.`)
      }
    }
    // Build a map from parent concept ID -> its child fields (via broaderPartitive or narrower concept refs)
    const parentIdToChildren = new Map<string, SchemaField[]>()

    for (const field of fields) {
      const parentId = Array.isArray(field.broaderPartitive) && field.broaderPartitive.length > 0 ? field.broaderPartitive[0] : undefined
      if (!parentId) continue
      if (!parentIdToChildren.has(parentId)) {
        parentIdToChildren.set(parentId, [])
      }
      parentIdToChildren.get(parentId)!.push(field)
    }

    // Root fields are those without broaderPartitive references
    const rootFields: SchemaField[] = []
    for (const field of fields) {
      if (!Array.isArray(field.broaderPartitive) || field.broaderPartitive.length === 0) {
        rootFields.push({ ...field })
      }
    }

    const roots = this.deduplicateChildNames(rootFields)
    // Attach children to all composites using conceptId lookup (not just root fields)
    for (const field of roots) {
      this.attachChildrenToComposite(field, parentIdToChildren)
    }

    return roots
  }

  /** Recursively attach children to a composite and its nested composites. */
  private attachChildrenToComposite(field: SchemaField, parentIdToChildren: Map<string, SchemaField[]>): void {
    const children = parentIdToChildren.get(field.conceptId)
    if (children && children.length > 0) {
      const dedupedChildren = this.deduplicateChildNames(children)
      field.children = dedupedChildren
      field.type = 'object' as const
    }

    // Recurse into any child that is itself a composite (i.e. has children to attach),
    // regardless of how the mapper typed it — a concept with broaderPartitive children is a composite.
    if (field.children) {
      for (const child of field.children) {
        if (parentIdToChildren.has(child.conceptId)) {
          this.attachChildrenToComposite(child, parentIdToChildren)
        }
      }
    }
  }

  getChildFields(parentId: string): SchemaField[] {
    const parentConcept = this.result.concepts.get(parentId)
    if (!parentConcept || !parentConcept.narrower) return []

    const children: SchemaField[] = []
    for (const narrowerId of parentConcept.narrower) {
      const narrowConcept = this.result.concepts.get(narrowerId)
      if (!narrowConcept) continue
      const mapped = this.mapper.mapConcept(narrowConcept)
      if (mapped) {
        children.push(mapped)
      }
    }
    return children
  }

  toSchemaProperties(fields: SchemaField[]): { properties: Record<string, unknown>; required: string[] } {
    const properties: Record<string, unknown> = {}
    const required: string[] = []

    for (const field of fields) {
      let schemaValue = this.fieldToSchema(field)
      if (field.isRepeatable) {
        schemaValue = this.wrapInArray(schemaValue, field.isRequired)
      }
      properties[field.propertyName] = schemaValue
      if (field.isRequired) {
        required.push(field.propertyName)
      }
    }

    return { properties, required }
  }

  private wrapInArray(items: unknown, isRequired: boolean): unknown {
    const arr: Record<string, unknown> = { items }
    if (isRequired) {
      arr.minItems = 1
    }
    return arr
  }

  private fieldToSchema(field: SchemaField): unknown {
    const schema: Record<string, unknown> = { title: field.label }

    if (field.description) {
      schema.description = field.description
    }

    if (field.type === 'object' && field.children) {
      schema.type = 'object'
      const childProps: Record<string, unknown> = {}
      const childRequired: string[] = []

      for (const child of field.children) {
        let childSchema = this.fieldToSchema(child)
        if (child.isRepeatable) {
          childSchema = this.wrapInArray(childSchema, child.isRequired)
        }
        childProps[child.propertyName] = childSchema
        if (child.isRequired) {
          childRequired.push(child.propertyName)
        }
      }

      schema.properties = childProps
      if (childRequired.length > 0) {
        schema.required = childRequired
      }
    } else {
      // Leaf type mapping
      schema.type = field.type

      if (field.enumValues !== undefined && field.enumValues!.length > 0) {
        schema.enum = field.enumValues
      }

      if (field.hasUnitConstraint) {
        if (field.hasUnitConstraint.type === 'const') {
          schema.allOf = [
            { properties: { hasUnit: { const: field.hasUnitConstraint.value } } },
          ]
        } else {
          schema.allOf = [
            { properties: { hasUnit: { enum: field.hasUnitConstraint.values } } },
          ]
        }
      }

      if (field.minimum !== undefined) {
        schema.minimum = field.minimum
      }
      if (field.maximum !== undefined) {
        schema.maximum = field.maximum
      }
      if (field.pattern) {
        schema.pattern = field.pattern
      }
    }

    return schema
  }

  private deduplicateChildNames(children: SchemaField[]): SchemaField[] {
    const nameCount = new Map<string, number>()
    for (const child of children) {
      nameCount.set(child.propertyName, (nameCount.get(child.propertyName) ?? 0) + 1)
    }
    const used = new Set<string>()
    return children.map(child => {
      const propertyName = nameCount.get(child.propertyName)! > 1
        ? this.mapper.derivePropertyNameFromId(child.conceptId)
        : child.propertyName
      if (used.has(propertyName)) {
        throw new Error(`Ambiguous sibling property "${propertyName}" at ${child.conceptId}.`)
      }
      used.add(propertyName)
      return propertyName === child.propertyName ? child : { ...child, propertyName }
    })
  }
}
