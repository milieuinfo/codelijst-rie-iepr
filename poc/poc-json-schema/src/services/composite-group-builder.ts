import type { Concept, CodelistResult, SchemaField } from '../models/index.js'
import { ConceptMapper } from './concept-mapper.js'

export class CompositeGroupBuilder {
  private readonly result: CodelistResult
  private readonly mapper: ConceptMapper

  constructor(result: CodelistResult, mapper: ConceptMapper) {
    this.result = result
    this.mapper = mapper
  }

  buildNestedStructure(fields: SchemaField[]): SchemaField[] {
    // Build a map from concept id -> its children fields
    const parentIdToChildren = new Map<string, SchemaField[]>()

    for (const field of fields) {
      if (!field.broader || field.broader.length === 0) continue
      const parentId = field.broader[0]
      if (!parentId) continue
      if (!parentIdToChildren.has(parentId)) {
        parentIdToChildren.set(parentId, [])
      }
      parentIdToChildren.get(parentId)!.push(field)
    }

    // Build a set of all child property names to exclude from root
    const childPropertyNames = new Set<string>()
    for (const field of fields) {
      if (field.broader && field.broader.length > 0) {
        childPropertyNames.add(field.propertyName)
      }
    }

    // Root fields are those without broader references
    const rootFields: SchemaField[] = []
    for (const field of fields) {
      if (!field.broader || field.broader.length === 0) {
        rootFields.push({ ...field })
      }
    }

    // Attach children to parent composites and mark as object type
    // We need to match parents by concept ID. Since we don't have conceptId on SchemaField,
    // we use the propertyName matching: find the root field whose derived name matches
    // what the parent concept's id would produce.
    for (const field of rootFields) {
      // Find which concept this field came from by reversing the name derivation
      const concept = this.findConceptByPropertyName(rootFields.map(f => f.propertyName).includes(field.propertyName) ? field.label : '')
      if (concept) {
        const children = parentIdToChildren.get(concept.id)
        if (children && children.length > 0) {
          const dedupedChildren = this.deduplicateChildNames(children)
          field.children = dedupedChildren
          field.type = 'object' as const
        }
      }
    }

    return rootFields
  }

  private findConceptByPropertyName(propertyName: string): Concept | null {
    for (const [, concept] of this.result.concepts.entries()) {
      const expectedName = this.mapper.derivePropertyName(concept)
      if (expectedName === propertyName) {
        return concept
      }
    }
    return null
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
    return children.map(child => {
      const count = nameCount.get(child.propertyName) || 0
      nameCount.set(child.propertyName, count + 1)
      if (count > 0) {
        return { ...child, propertyName: `${child.propertyName}${count}` }
      }
      return child
    })
  }
}
