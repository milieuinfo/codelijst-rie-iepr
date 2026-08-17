import type { Concept, CodelistResult, SchemaField } from '../models/index.js'
import { ConceptMapper } from './concept-mapper.js'

interface MergeGroup {
  variantFields: SchemaField[]
  triggerPath: string
}

export class CompositeGroupBuilder {
  private readonly result: CodelistResult
  private readonly mapper: ConceptMapper

  constructor(result: CodelistResult, mapper: ConceptMapper) {
    this.result = result
    this.mapper = mapper
  }

  buildNestedStructure(fields: SchemaField[]): SchemaField[] {
    // Build a map from parent concept ID -> its child fields (via isPartOf or narrower concept refs)
    const parentIdToChildren = new Map<string, SchemaField[]>()

    for (const field of fields) {
      const parentId = Array.isArray(field.isPartOf) && field.isPartOf.length > 0 ? field.isPartOf[0] : undefined
      if (!parentId) continue
      if (!parentIdToChildren.has(parentId)) {
        parentIdToChildren.set(parentId, [])
      }
      parentIdToChildren.get(parentId)!.push(field)
    }

    // Root fields are those without isPartOf references
    const rootFields: SchemaField[] = []
    for (const field of fields) {
      if (!Array.isArray(field.isPartOf) || field.isPartOf.length === 0) {
        rootFields.push({ ...field })
      }
    }

    // Attach children to all composites using conceptId lookup (not just root fields)
    for (const field of rootFields) {
      this.attachChildrenToComposite(field, parentIdToChildren)
    }

    return rootFields
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
    // regardless of how the mapper typed it — a concept with isPartOf children is a composite.
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

  /** Merge related composite groups into single object fields. */
  mergeRelatedGroups(fields: SchemaField[]): SchemaField[] {
    const merged: SchemaField[] = []
    const consumed = new Set<string>()

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i]
      const isMergableComposite = !!(field.condition && field.children && field.children.length > 0)

      if (!isMergableComposite) {
        // Recurse into children that are objects with children
        const newChildren = field.children?.length ? this.mergeRelatedGroups(field.children) : undefined
        if (newChildren && newChildren !== field.children) {
          merged.push({ ...field, children: newChildren })
        } else {
          merged.push(field)
        }
        continue
      }
      if (consumed.has(field.conceptId)) continue

      // Find all sibling composites in the same parent group that are connected via `related`
      const component: SchemaField[] = [field]
      consumed.add(field.conceptId)

      for (let j = i + 1; j < fields.length; j++) {
        const other = fields[j]
        if (!other.condition || !other.children || other.children.length === 0) continue
        if (consumed.has(other.conceptId)) continue

        // Check if 'other' is related to any member of our component
        if (this.isInComponent(other, component)) {
          component.push(other)
          consumed.add(other.conceptId)
        }
      }

      if (component.length > 1) {
        merged.push(this.mergeVariantGroup(component))
      } else {
        // Single item — still recurse into its children to find mergeable groups deeper
        const singleField = fields[i]
        const newChildren = singleField.children?.length ? this.mergeRelatedGroups(singleField.children) : undefined
        if (newChildren && newChildren !== singleField.children) {
          merged.push({ ...singleField, children: newChildren })
        } else {
          merged.push(fields[i])
        }
      }
    }

    return merged
  }

  /** Check if a field is related to any field already in the merge component. */
  private isInComponent(field: SchemaField, component: SchemaField[]): boolean {
    const fieldRelated = this.result.concepts.get(field.conceptId)?.related ?? []
    for (const comp of component) {
      const compRelated = this.result.concepts.get(comp.conceptId)?.related ?? []
      // Bidirectional check: does either list contain the other's concept ID?
      if (fieldRelated.includes(comp.conceptId) || compRelated.includes(field.conceptId)) {
        return true
      }
    }
    return false
  }

  /** Merge a group of variant composite fields into one unified object field. */
  private mergeVariantGroup(variants: SchemaField[]): SchemaField {
    // Compute common trigger path from first variant, keeping the raw conditionPath concept id
    // so the assembler can resolve it to the real promoted property name via conceptToPropertyName.
    const triggerPath = this.result.concepts.get(variants[0].conceptId)?.conditionPath ?? variants[0].condition!.path

    // Collect all distinct condition values across variants
    const allValues = new Set<string>()
    for (const v of variants) {
      if (v.condition?.values) {
        for (const val of v.condition.values) {
          allValues.add(val)
        }
      }
    }

    // Compute propertyName: longest common prefix of local parts of concept IDs
    const localParts = variants.map(v => this.getLocalPart(v.conceptId))
    const commonPrefix = this.longestCommonPrefix(localParts)
    const mergedPropertyName = this.camelCase(commonPrefix.replace(/-+$/, ''))

    // Gather children from all variants, deduplicate by key
    const childKeyMap = new Map<string, SchemaField>()
    const appearanceOrder: Array<{ label: string; required: boolean; value: string }> = []

    for (const variant of variants) {
      if (!variant.children) continue
      for (const child of variant.children) {
        // Dedup key: relationUri + lowercase trimmed label
        const dedupKey = `${child.relationUri || ''}::${(child.label ?? '').trim().toLowerCase()}`
        const condVal = variant.condition?.values?.[0] || ''
        if (!childKeyMap.has(dedupKey)) {
          // Record first-appearance info for ordering and requiredConditions computation
          appearanceOrder.push({
            label: child.label || '',
            required: child.isRequired,
            value: condVal,
          })
          // Initialize appearances with the first occurrence
          child.appearances = [{ value: condVal, required: child.isRequired }]
          childKeyMap.set(dedupKey, child)
        } else {
          // Duplicate — record the additional appearance info but keep original
          const existing = childKeyMap.get(dedupKey)!
          existing.appearances!.push({
            value: condVal,
            required: child.isRequired,
          })
        }
      }
    }

    // Build merged children with proper appearances and requiredConditions
    const mergedChildren: SchemaField[] = []
    let previousConceptId: string | undefined

    for (const [dedupKey, child] of childKeyMap) {
      const dupChild = { ...child }

      // Compute propertyName from label: camelCase
      dupChild.propertyName = this.camelCase((dupChild.label ?? '').replace(/[-_]/g, '_'))

      // Collect distinct condition values from all appearances
      const appearances = dupChild.appearances!
      const childValues = new Set<string>()
      for (const app of appearances) {
        if (app.value) childValues.add(app.value)
      }
      dupChild.condition = { path: triggerPath, values: [...childValues] }

      // Compute requiredConditions:
      // - If appears in >1 variant: required only if ALL appearances are required
      // - If single appearance: required if that one is required
      const hasMultipleAppearances = appearances.length > 1
      if (hasMultipleAppearances) {
        const allRequired = appearances.every(a => a.required)
        dupChild.requiredConditions = allRequired ? [...childValues] : []
      } else {
        dupChild.requiredConditions = appearances[0]?.required ? [...childValues] : []
      }

      // isRequired: all requiredness handled via conditional blocks
      dupChild.isRequired = false

      // UI ordering: chain via uiAfterConceptId from previous child's first-appearance conceptId
      if (previousConceptId) {
        dupChild.uiAfterConceptId = previousConceptId
      }
      previousConceptId = dupChild.conceptId

      mergedChildren.push(dupChild)
    }

    // Build the merged group field
    const mergedField: SchemaField = {
      conceptId: variants[0].conceptId, // Use first variant's concept as anchor
      propertyName: mergedPropertyName,
      label: variants[0].label || 'Bestemmingsidentificatie',
      description: variants[0].description,
      type: 'object' as const,
      isRequired: false,
      isRepeatable: false,
      condition: { path: triggerPath, values: [...allValues] },
      children: mergedChildren,
      extensions: variants[0].extensions ? { ...variants[0].extensions } : undefined,
      narrower: variants.flatMap(v => v.narrower ?? []).filter((v, i, a) => a.indexOf(v) === i),
      isPartOf: variants[0].isPartOf,
    }

    return mergedField
  }

  private getLocalPart(conceptId: string): string {
    return conceptId.split(':').pop() || conceptId
  }

  private longestCommonPrefix(strings: string[]): string {
    if (strings.length === 0) return ''
    if (strings.length === 1) return strings[0]

    let prefix = strings[0]
    for (let i = 1; i < strings.length; i++) {
      while (!strings[i].startsWith(prefix)) {
        prefix = prefix.slice(0, -1)
        if (prefix === '') return ''
      }
    }
    return prefix
  }

  private camelCase(str: string): string {
    return str.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase())
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
    // Only deduplicate non-relation children; relation-bearing ones are deduplicated at assembly time with CURIE prefix
    const nameCount = new Map<string, number>()
    const seenCount = new Map<string, number>()
    for (const child of children) {
      if (!child.relationUri) {
        const c = nameCount.get(child.propertyName) || 0
        nameCount.set(child.propertyName, c + 1)
      }
    }

    return children.map(child => {
      if (child.relationUri) return child
      const count = seenCount.get(child.propertyName) || 0
      seenCount.set(child.propertyName, count + 1)
      if (count > 0) {
        return { ...child, propertyName: `${child.propertyName}${count}` }
      }
      return child
    })
  }
}
