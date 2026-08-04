import type { Concept, CodelistResult, JsonSchemaObject, JsonSchemaValue, SchemaField } from '../models/index.js'
import type { ThemeChain } from './theme-resolver.js'
import { config } from '../config.js'

export class SchemaAssembler {
  private readonly baseSchema: JsonSchemaObject
  private readonly baseRef: string

  constructor(baseSchema: JsonSchemaObject) {
    this.baseSchema = baseSchema
    this.baseRef = baseSchema.$id || `${config.baseSchemaUrl}/observatie.json`
  }

  assemble(
    themeName: string,
    domainFields: SchemaField[],
    conditionalBlock: JsonSchemaObject | null,
    chain: ThemeChain,
    result: CodelistResult,
  ): { baseSchema: JsonSchemaObject; domainSchema: JsonSchemaObject } {
    const themeSlug = themeName.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()

    const domainId = `${config.baseSchemaUrl}/${themeSlug}/schema.json`

    // Collect observedProperty enum: all measurable concepts from the leaf scheme
    const observedPropertyValues = this.collectObservedPropertyValues(chain, result)

    // Collect hasUnit enum: aggregate unique unit URIs from all fields with units
    const unitUris = this.collectUnitUris(domainFields, result)

    // Build required array from core envelope + domain fields
    const required: string[] = ['resultTime', 'observedProperty', 'hasFeatureOfInterest', 'hasResult']
    for (const field of domainFields) {
      if (field.isRequired) {
        required.push(field.propertyName)
      }
    }

    // Build properties with $ref to base schema + local overrides
    const properties: Record<string, JsonSchemaValue> = {}

    properties.resultTime = { $ref: `${this.baseRef}#/properties/resultTime` }
    properties.wasOriginatedBy = { $ref: `${this.baseRef}#/properties/wasOriginatedBy` }
    properties.hasFeatureOfInterest = {
      type: 'string',
      allOf: [{ $ref: `${this.baseRef}#/properties/hasFeatureOfInterest` }] as JsonSchemaValue[],
    }

    // observedProperty: base $ref + theme-specific enum of measurable concepts
    const observedPropAllOf: JsonSchemaValue[] = [
      { $ref: `${this.baseRef}#/properties/observedProperty` },
    ]
    if (observedPropertyValues.length > 0) {
      observedPropAllOf.push({ enum: observedPropertyValues })
    }
    properties.observedProperty = {
      type: 'string',
      allOf: observedPropAllOf,
    }

    // hasResult: base $ref + aggregated unit enum + numeric result passthrough
    const hasResultAllOf: JsonSchemaValue[] = [
      { $ref: `${this.baseRef}#/properties/hasResult` },
    ]
    if (unitUris.length > 0) {
      const unitConstraint: Record<string, unknown> = {
        type: 'object',
        properties: {
          hasUnit: unitUris.length === 1 ? { const: unitUris[0] } : { enum: unitUris },
        },
      }
      hasResultAllOf.push(unitConstraint)
    }
    properties.hasResult = { allOf: hasResultAllOf }

    // Add domain fields as additional top-level properties
    for (const field of domainFields) {
      const fieldSchema = this.buildFieldSchema(field)
      if (fieldSchema && Object.keys(fieldSchema).length > 0) {
        properties[field.propertyName] = fieldSchema as JsonSchemaValue
      }
    }

    // Build allOf array: base ref + conditionals
    const allOf: JsonSchemaValue[] = [
      { $ref: this.baseRef },
    ]

    if (conditionalBlock) {
      allOf.push(conditionalBlock)
    }

    // Per-observable conditional blocks for min/max and unit constraints
    const walkFields = (fs: SchemaField[]) => {
      for (const f of fs) {
        if (f.minimum !== undefined || f.maximum !== undefined || f.hasUnitConstraint) {
          allOf.push(this.buildMinMaxConditional(f, result.expandCurie))
        }
        if (f.children) walkFields(f.children)
      }
    }
    walkFields(domainFields)

    const domainSchema: JsonSchemaObject = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: domainId,
      description: `RIE-IEPR observatie voor ${themeName}`,
      type: 'object',
      required: [...new Set(required)],
      properties,
      allOf: allOf,
    }

    return { baseSchema: this.baseSchema, domainSchema }
  }

  /** Collect concept IDs that represent measurable values across the theme's scheme chain. */
  private collectObservedPropertyValues(chain: ThemeChain, result: CodelistResult): string[] {
    const leafSchemeId = chain.leafSchemeId
    const values: string[] = []
    const seenIds = new Set<string>()

    for (const [conceptId, concept] of result.concepts.entries()) {
      // Only consider concepts in schemes belonging to this theme's chain
      if (!chain.schemeIds.includes(concept.inScheme ?? '')) continue

      // Skip hidden or structural-only concepts
      if (concept.isOnzichtbaar === true) continue
      // Include concepts that have a data type or unit defined (i.e., carry measurable/reported values)
      if (!concept.relevantDataType && !concept.relevantUnit) continue

      if (!seenIds.has(conceptId)) {
        values.push(result.expandCurie?.(conceptId) ?? conceptId)
        seenIds.add(conceptId)
      }
    }

    return values
  }

  /** Aggregate unique unit URIs from all domain fields (including nested). */
  private collectUnitUris(fields: SchemaField[], result: CodelistResult): string[] {
    const uriSet = new Set<string>()

    const walk = (fs: SchemaField[]) => {
      for (const f of fs) {
        if (f.hasUnitConstraint?.type === 'const') uriSet.add(f.hasUnitConstraint.value)
        if (f.hasUnitConstraint?.type === 'enum') {
          for (const v of f.hasUnitConstraint.values) uriSet.add(v)
        }
        // Also check the concept itself for relevantUnit that wasn't captured in hasUnitConstraint
        const concept = result.concepts.get(f.conceptId)
        if (concept?.relevantUnit) {
          for (const u of concept.relevantUnit) {
            if (!isPlaceholderUrl(u)) uriSet.add(u)
          }
        }
        if (f.children) walk(f.children)
      }
    }

    walk(fields)
    return [...uriSet]
  }

  /** Build an if/then block that constrains numericValue and/or hasUnit based on observed property. */
  private buildMinMaxConditional(field: SchemaField, expandCurie?: (curie: string) => string): JsonSchemaObject {
    const hasResultProps: Record<string, JsonSchemaValue> = {}

    if (field.minimum !== undefined || field.maximum !== undefined) {
      hasResultProps.numericValue = {
        type: 'number' as const,
        ...(field.minimum !== undefined ? { minimum: field.minimum } : {}),
        ...(field.maximum !== undefined ? { maximum: field.maximum } : {}),
      }
    }

    if (field.hasUnitConstraint?.type === 'const') {
      hasResultProps.hasUnit = { const: field.hasUnitConstraint.value }
    } else if (field.hasUnitConstraint?.type === 'enum') {
      hasResultProps.hasUnit = { enum: field.hasUnitConstraint.values }
    }

    if (Object.keys(hasResultProps).length === 0) return {} as JsonSchemaObject

    const expandedConceptId = expandCurie ? expandCurie(field.conceptId) : field.conceptId
    return {
      if: {
        properties: {
          observedProperty: { const: expandedConceptId },
        },
      },
      then: {
        properties: {
          hasResult: {
            type: 'object',
            properties: hasResultProps,
          },
        },
      },
    }
  }

  private buildFieldSchema(field: SchemaField): JsonSchemaObject | null {
    let schemaObj: JsonSchemaObject = { title: field.label }

    if (field.description) {
      schemaObj.description = field.description
    }

    if (field.type === 'object' && field.children) {
      schemaObj.type = 'object'
      const childProps: Record<string, JsonSchemaValue> = {}
      const childRequired: string[] = []

      for (const child of field.children) {
        childProps[child.propertyName] = this.buildChildSchema(child) as JsonSchemaValue
        if (child.isRequired) childRequired.push(child.propertyName)
      }

      schemaObj.properties = childProps
      if (childRequired.length > 0) schemaObj.required = childRequired
    } else if (!field.condition || !field.condition.path) {
      // Leaf types
      schemaObj.type = field.type
      if (field.enumValues !== undefined && field.enumValues!.length > 0) {
        schemaObj.enum = field.enumValues
      }
      if (field.minimum !== undefined) schemaObj.minimum = field.minimum
      if (field.maximum !== undefined) schemaObj.maximum = field.maximum
      if (field.pattern) schemaObj.pattern = field.pattern
    } else {
      return null
    }

    // Wrap in array for repeatable fields
    if (field.isRepeatable) {
      const wrapped: JsonSchemaObject = { type: 'array', items: schemaObj }
      if (field.isRequired) wrapped.minItems = 1
      return wrapped
    }

    return schemaObj
  }

  private buildChildSchema(child: SchemaField): JsonSchemaObject {
    let schema: JsonSchemaObject = { title: child.label }
    if (child.description) schema.description = child.description
    schema.type = child.type
    if (child.enumValues && child.enumValues.length > 0) schema.enum = child.enumValues
    if (child.minimum !== undefined) schema.minimum = child.minimum
    if (child.maximum !== undefined) schema.maximum = child.maximum
    if (child.pattern) schema.pattern = child.pattern
    if (child.isRepeatable) {
      schema = { type: 'array', items: schema }
      if (child.isRequired) schema.minItems = 1
    }
    return schema
  }
}

function isPlaceholderUrl(url: string): boolean {
  return config.placeholderMarkers.some(marker => url.includes(marker))
}
