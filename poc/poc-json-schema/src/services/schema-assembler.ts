import type { JsonSchemaObject, JsonSchemaValue, SchemaField } from '../models/index.js'

export class SchemaAssembler {
  private readonly baseSchema: JsonSchemaObject
  private readonly baseRef: string

  constructor(baseSchema: JsonSchemaObject) {
    this.baseSchema = baseSchema
    this.baseRef = baseSchema.$id || 'https://data.riepr.omgeving.vlaanderen.be/schema/2026/observatie/observatie.json'
  }

  assemble(
    themeName: string,
    domainFields: SchemaField[],
    conditionalBlock: JsonSchemaObject | null,
  ): { baseSchema: JsonSchemaObject; domainSchema: JsonSchemaObject } {
    const themeSlug = themeName.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()

    const domainId = `https://data.riepr.omgeving.vlaanderen.be/schema/2026/observatie/${themeSlug}/schema.json`

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
    properties.observedProperty = {
      type: 'string',
      allOf: [{ $ref: `${this.baseRef}#/properties/observedProperty` }] as JsonSchemaValue[],
    }
    properties.hasResult = {
      allOf: [{ $ref: `${this.baseRef}#/properties/hasResult` }] as JsonSchemaValue[],
    }

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

  private buildFieldSchema(field: SchemaField): JsonSchemaObject | null {
    if (!field.condition || !field.condition.path) {
      let schemaObj: JsonSchemaObject = { title: field.label }

      if (field.description) {
        schemaObj.description = field.description
      }

      if (field.type === 'object' && field.children) {
        schemaObj.type = 'object'
        const childProps: Record<string, JsonSchemaValue> = {}
        const childRequired: string[] = []

        for (const child of field.children) {
          let childDef: JsonSchemaObject = { title: child.label, type: child.type }
          if (child.description) childDef.description = child.description
          if (child.enumValues && child.enumValues!.length > 0) childDef.enum = child.enumValues
          if (child.minimum !== undefined) childDef.minimum = child.minimum
          if (child.maximum !== undefined) childDef.maximum = child.maximum

          if (child.isRepeatable) {
            childDef = { type: 'array', items: childDef }
            if (child.isRequired) childDef.minItems = 1
          }

          childProps[child.propertyName] = childDef
          if (child.isRequired) childRequired.push(child.propertyName)
        }

        schemaObj.properties = childProps
        if (childRequired.length > 0) schemaObj.required = childRequired
      } else {
        // Leaf types
        schemaObj.type = field.type
        if (field.enumValues !== undefined && field.enumValues!.length > 0) {
          schemaObj.enum = field.enumValues
        }
        if (field.minimum !== undefined) schemaObj.minimum = field.minimum
        if (field.maximum !== undefined) schemaObj.maximum = field.maximum
        if (field.pattern) schemaObj.pattern = field.pattern
      }

      // Wrap in array for repeatable fields
      let finalSchema: JsonSchemaObject = schemaObj
      if (field.isRepeatable) {
        finalSchema = { type: 'array', items: schemaObj }
        if (field.isRequired) finalSchema.minItems = 1
      }

      return finalSchema
    }

    return null
  }
}
