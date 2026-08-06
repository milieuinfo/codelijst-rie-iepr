import type { Concept, CodelistResult, JsonSchemaObject, JsonSchemaValue, SchemaField, SubSchema } from '../models/index.js'
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
  ): { baseSchema: JsonSchemaObject; domainSchema: JsonSchemaObject; subSchemas?: SubSchema[] } {
    const themeSlug = themeName.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()

    const domainId = `${config.baseSchemaUrl}/${themeSlug}/schema.json`

    // Collect observedProperty enum: all measurable concepts from the leaf scheme
    const observedPropertyValues = this.collectObservedPropertyValues(chain, result)

    // Collect hasUnit enum: aggregate unique unit URIs from all fields with units
    // Find FoI field in domain fields
    const foiField = domainFields.find(f => f.isFeatureOfInterest === true)

    // Split domain fields into regular vs Observation composites (sub-schemas)
    const observationCompositeFields = domainFields.filter(f => f.relevantClass === 'sosa:Observation')
    const regularDomainFields = domainFields.filter(f => f.relevantClass !== 'sosa:Observation')

    // Collect hasUnit enum: aggregate unique unit URIs from regular fields only
    const unitUris = this.collectUnitUris(regularDomainFields, result)

    // Build required array from core envelope + domain fields
    const required: string[] = ['resultTime', 'observedProperty', 'hasFeatureOfInterest', 'hasResult']
    for (const field of regularDomainFields) {
      if (field.isRequired && !field.isFeatureOfInterest) {
        required.push(field.propertyName)
      }
    }

    // Build properties with $ref to base schema + local overrides
    const properties: Record<string, JsonSchemaValue> = {}

    properties.resultTime = { $ref: `${this.baseRef}#/properties/resultTime` }
    properties.wasOriginatedBy = { $ref: `${this.baseRef}#/properties/wasOriginatedBy` }

    // hasFeatureOfInterest: use FoI concept metadata or fallback to generic
    if (foiField) {
      const foiConcept = result.concepts.get(foiField.conceptId)
      let foiPropSchema: JsonSchemaObject | undefined
      const foiBase: JsonSchemaObject = { title: foiField.label }
      if (foiField.description) {
        foiBase.description = foiField.description
      }
      const isMultiselect = foiConcept?.isMultiselect === true
      if (foiField.type === 'array' || foiField.isRepeatable || isMultiselect) {
        foiBase.type = 'array'
        foiBase.items = { $ref: `${this.baseRef}#/properties/hasFeatureOfInterest` }
      } else {
        foiBase.type = 'string'
        foiBase.allOf = [{ $ref: `${this.baseRef}#/properties/hasFeatureOfInterest` }] as JsonSchemaValue[]
      }
      foiPropSchema = foiBase
      properties.hasFeatureOfInterest = foiPropSchema as JsonSchemaValue
    } else {
      properties.hasFeatureOfInterest = {
        type: 'string',
        allOf: [{ $ref: `${this.baseRef}#/properties/hasFeatureOfInterest` }] as JsonSchemaValue[],
      }
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
    for (const field of regularDomainFields) {
      if (field.isFeatureOfInterest) continue
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
          const cond = this.buildMinMaxConditional(f, result.expandCurie)
          if (cond) allOf.push(cond)
        }
        if (f.children) walkFields(f.children)
      }
    }
    walkFields(regularDomainFields)

    const domainSchema: JsonSchemaObject = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: domainId,
      description: `RIE-IEPR observatie voor ${themeName}`,
      type: 'object',
      required: [...new Set(required)],
      properties,
      allOf: allOf,
    }

    // Generate sub-schemas for sosa:Observation composite fields
    const subSchemas: SubSchema[] = []
    for (const obsField of observationCompositeFields) {
      const subSchema = this.buildSubSchema(domainId, themeSlug, obsField, result)
      subSchemas.push(subSchema)
    }

    return { baseSchema: this.baseSchema, domainSchema, subSchemas: subSchemas.length > 0 ? subSchemas : undefined }
  }

  /** Collect concept IDs that represent measurable values across the theme's scheme chain. */
  private collectObservedPropertyValues(chain: ThemeChain, result: CodelistResult): string[] {
    const observationCompositeIds = this.collectObservationCompositeConceptIds(result)
    const values: string[] = []
    const seenIds = new Set<string>()

    for (const [conceptId, concept] of result.concepts.entries()) {
      if (!chain.schemeIds.includes(concept.inScheme ?? '')) continue
      if (concept.isOnzichtbaar === true) continue
      if (!concept.relevantDataType && !concept.relevantUnit) continue
      if (concept.isPartOf && observationCompositeIds.has(concept.isPartOf[0])) continue

      if (!seenIds.has(conceptId)) {
        values.push(result.expandCurie?.(conceptId) ?? conceptId)
        seenIds.add(conceptId)
      }
    }

    return values
  }

  /** Collect IDs of all concepts whose relevantClass is sosa:Observation. */
  private collectObservationCompositeConceptIds(result: CodelistResult): Set<string> {
    const ids = new Set<string>()
    for (const concept of result.concepts.values()) {
      if (concept.relevantClass === 'sosa:Observation') {
        ids.add(concept.id)
      }
    }
    return ids
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
  private buildMinMaxConditional(field: SchemaField, expandCurie?: (curie: string) => string): JsonSchemaObject | null {
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

    if (Object.keys(hasResultProps).length === 0) return null

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

  /** Build an if/then block for a hasResult child that maps into the hasResult object. */
  private buildHasResultConditional(field: SchemaField, expandCurie?: (curie: string) => string): JsonSchemaObject | null {
    if (field.type !== 'number') return null

    const numVal: Record<string, unknown> = { type: 'number' as const }
    if (field.minimum !== undefined) numVal.minimum = field.minimum
    if (field.maximum !== undefined) numVal.maximum = field.maximum

    const expandedConceptId = expandCurie ? expandCurie(field.conceptId) : field.conceptId

    const hasThenProps: Record<string, unknown> = {}
    hasThenProps.numericValue = numVal

    if (field.hasUnitConstraint?.type === 'const') {
      hasThenProps.hasUnit = { const: field.hasUnitConstraint.value }
    } else if (field.hasUnitConstraint?.type === 'enum') {
      hasThenProps.hasUnit = { enum: field.hasUnitConstraint.values }
    }

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
            properties: hasThenProps as Record<string, JsonSchemaValue>,
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

  private buildSubSchema(parentSchemaId: string, themeSlug: string, obsField: SchemaField, result: CodelistResult): SubSchema {
    const subName = this.toKebabCase(obsField.propertyName)
    const subId = `${parentSchemaId.replace(/\/schema\.json$/, '')}/${subName}/schema.json`

    const subObservedPropertyValues = this.collectSubObservedPropertyValues(obsField.children || [], result)
    const subUnitUris = this.collectSubUnitUris(obsField.children || [], result)

    const childProps: Record<string, JsonSchemaValue> = {}
    const childRequired: string[] = []
    const hasResultChildren: SchemaField[] = []
    for (const child of obsField.children || []) {
      if (child.isHasResult === true) {
        hasResultChildren.push(child)
        continue
      }
      const childSchema = this.buildChildSchema(child)
      if (childSchema && Object.keys(childSchema).length > 0) {
        childProps[child.propertyName] = childSchema as JsonSchemaValue
        if (child.isRequired) childRequired.push(child.propertyName)
      }
    }

    const observedPropAllOf: JsonSchemaValue[] = [
      { $ref: `${this.baseRef}#/properties/observedProperty` },
    ]
    if (subObservedPropertyValues.length > 0) {
      observedPropAllOf.push({ enum: subObservedPropertyValues })
    }

    const hasResultAllOf: JsonSchemaValue[] = [
      { $ref: `${this.baseRef}#/properties/hasResult` },
    ]
    if (subUnitUris.length > 0) {
      hasResultAllOf.push({
        type: 'object',
        properties: {
          hasUnit: subUnitUris.length === 1 ? { const: subUnitUris[0] } : { enum: subUnitUris },
        },
      })
    }

    return {
      name: subName,
      schema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: subId,
        description: `RIE-IEPR observatie voor ${obsField.label}`,
        type: 'object',
        required: [...new Set(['resultTime', 'observedProperty', 'hasFeatureOfInterest', 'hasResult', ...childRequired])],
        properties: {
          resultTime: { $ref: `${this.baseRef}#/properties/resultTime` },
          wasOriginatedBy: { $ref: `${this.baseRef}#/properties/wasOriginatedBy` },
          hasFeatureOfInterest: { $ref: `${this.baseRef}#/properties/hasFeatureOfInterest` },
          observedProperty: {
            type: 'string',
            allOf: observedPropAllOf,
          },
          hasResult: {
            allOf: hasResultAllOf,
          },
          ...childProps,
        },
        allOf: [
          { $ref: this.baseRef },
          { $ref: parentSchemaId },
          ...hasResultChildren.map(c => this.buildHasResultConditional(c, result.expandCurie)).filter((x): x is JsonSchemaObject => x !== null),
        ],
      },
    }
  }

  private toKebabCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
  }

  private collectSubObservedPropertyValues(children: SchemaField[], result: CodelistResult): string[] {
    const values: string[] = []
    const seenIds = new Set<string>()
    for (const child of children) {
      const concept = result.concepts.get(child.conceptId)
      if (!concept) continue
      if (concept.isOnzichtbaar === true) continue
      if (!concept.relevantDataType && !concept.relevantUnit) continue
      const expandedId = result.expandCurie?.(child.conceptId) ?? child.conceptId
      if (!seenIds.has(expandedId)) {
        values.push(expandedId)
        seenIds.add(expandedId)
      }
    }
    return values
  }

  private collectSubUnitUris(children: SchemaField[], result: CodelistResult): string[] {
    const uriSet = new Set<string>()
    for (const child of children) {
      if (child.hasUnitConstraint?.type === 'const') uriSet.add(child.hasUnitConstraint.value)
      if (child.hasUnitConstraint?.type === 'enum') {
        for (const v of child.hasUnitConstraint.values) uriSet.add(v)
      }
      const concept = result.concepts.get(child.conceptId)
      if (concept?.relevantUnit) {
        for (const u of concept.relevantUnit) {
          if (!isPlaceholderUrl(u)) uriSet.add(u)
        }
      }
    }
    return [...uriSet]
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
