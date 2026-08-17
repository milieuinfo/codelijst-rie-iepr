import type { Concept, CodelistResult, SchemaField } from '../models/index.js'
import type { EnumResolution } from './enum-generator.js'
import { EnumGenerator } from './enum-generator.js'

export class ConceptMapper {
  private readonly result: CodelistResult
  private readonly nameCount = new Map<string, number>()
  private readonly enumGen: EnumGenerator

  constructor(result: CodelistResult) {
    this.result = result
    this.enumGen = new EnumGenerator(result)
  }

  mapConcept(concept: Concept): SchemaField | null {
    if (concept.isOnzichtbaar === true) return null
    if (!concept.id || !concept.prefLabel) return null

    const type = this.mapDataType(concept)
    const isRequired = concept.isVerplicht === true
    const isRepeatable = concept.isMeervoudig === true

    // Property name derived from relation predicate if present, else from concept ID
    const propertyName = concept.relation ? this.derivePropertyNameFromRelation(concept.relation) : this.derivePropertyName(concept)

    // Handle duplicate property names within same scheme (only for non-relation names; relations are deduped at assembly time)
    const finalName = concept.relation ? propertyName : this.trackName(propertyName)

    const label = concept.prefLabel
    const description = concept.definition || concept.note || undefined

    const schemaField: SchemaField = {
      conceptId: concept.id,
      propertyName: finalName,
      label,
      description,
      type,
      isRequired,
      isRepeatable,
      isPartOf: concept.isPartOf,
      narrower: concept.narrower,
      relevantClass: concept.relevantClass,
      isFeatureOfInterest: concept.relation === 'sosa:hasFeatureOfInterest',
      isHasResult: concept.relation === 'sosa:hasResult',
      isObservedProperty: concept.relation === 'sosa:observedProperty',
      isUsedProcedure: concept.relation === 'sosa:usedProcedure',
      isMadeBySensor: concept.relation === 'sosa:madeBySensor',
      isResultTime: concept.relation === 'sosa:resultTime',
      isPhenomenonTime: concept.relation === 'sosa:phenomenonTime',
      isSimpleResult: concept.relation === 'sosa:hasSimpleResult',
    }

    // JSON-LD annotations from relation (x-jsonld-id, x-jsonld-type)
    if (concept.relation) {
      const expandedUri = this.result.expandCurie?.(concept.relation) ?? concept.relation
      schemaField.relationUri = expandedUri
      schemaField.extensions = {
        ...(schemaField.extensions || {}),
        'x-jsonld-id': expandedUri,
        'x-jsonld-type': this.mapXJsonLdType(concept.relevantDataType, type),
      }
    }

    // Type mapping with format (skip for enum/relevantRiepr concepts where relevantDataType is always string)
    if (type === 'string' && concept.relevantDataType && !concept.relevantCodeList?.length && !concept.relevantRiepr?.length) {
      if (concept.relevantDataType.includes('date') && !concept.relevantDataType.includes('dateTime')) {
        schemaField.extensions = { ...(schemaField.extensions || {}), 'x-jsonld-type': 'http://www.w3.org/2001/XMLSchema#date' }
      } else if (concept.relevantDataType.includes('dateTime')) {
        schemaField.extensions = { ...(schemaField.extensions || {}), 'x-jsonld-type': 'http://www.w3.org/2001/XMLSchema#dateTime' }
      }
    }

    // Enum resolution from relevantCodeList
    if (concept.relevantCodeList && concept.relevantCodeList.length > 0) {
      const enumRes = this.enumGen.resolveEnums(concept)
      if (enumRes.resolved && enumRes.values.length > 0) {
        schemaField.enumValues = enumRes.values
      } else if (enumRes.warning) {
        console.warn(`[ConceptMapper] ${enumRes.warning}`)
      }
    }

    // Unit constraints from relevantUnit
    if (concept.relevantUnit && concept.relevantUnit.length > 0) {
      const units = concept.relevantUnit.filter(u => u !== 'http://TODO' && !u.startsWith('http://TODO'))
      if (units.length === 0) {
        console.warn(`[ConceptMapper] Unresolved unit references for "${label}" (${concept.id})`)
      } else if (units.length === 1) {
        schemaField.hasUnitConstraint = { type: 'const', value: units[0] }
      } else {
        schemaField.hasUnitConstraint = { type: 'enum', values: units }
      }
    }

    // Numeric data types imply hasResult.numericValue (skip for enum/relevantRiepr concepts)
    if (!concept.relevantCodeList?.length && !concept.relevantRiepr?.length && (concept.relevantDataType === 'xsd:decimal' || concept.relevantDataType === 'xsd:integer')) {
      schemaField.hasNumericResult = true
    }

    // Min/max value constraints from codelist
    if (concept.minValue !== undefined) schemaField.minimum = concept.minValue
    if (concept.maxValue !== undefined) schemaField.maximum = concept.maxValue

    // Condition path/value for conditional visibility
    if (concept.conditionPath && concept.conditionValue) {
      const triggerPropertyName = this.derivePropertyNameFromId(concept.conditionPath)
      schemaField.condition = {
        path: triggerPropertyName,
        values: [concept.conditionValue],
      }
    }

    // UI ordering annotations (x-ui-first / x-ui-after)
    if (concept.uiFirst === true) {
      schemaField.uiFirst = true
    }
    if (concept.uiAfter) {
      schemaField.uiAfterConceptId = concept.uiAfter
    }

    return schemaField
  }

  derivePropertyName(concept: Concept): string {
    return this.derivePropertyNameFromId(concept.id)
  }

  derivePropertyNameFromId(id: string): string {
    const localPart = id.split(':').pop() || id
    return this.toCamelCase(localPart.replace(/[-_]/g, '_'))
  }

  /** Derive JSON property name from a relation predicate (e.g. "sosa:usedProcedure" → "usedProcedure"). */
  derivePropertyNameFromRelation(relation: string): string {
    const localPart = relation.split(':').pop() || relation
    return localPart
  }

  private trackName(name: string): string {
    const count = this.nameCount.get(name) || 0
    this.nameCount.set(name, count + 1)
    if (count > 0) {
      return `${name}${count}`
    }
    return name
  }

  private mapDataType(concept: Concept): SchemaField['type'] {
    switch (concept.relevantDataType) {
      case 'xsd:string':
        return 'string'
      case 'xsd:boolean':
        return 'boolean'
      case 'xsd:decimal':
      case 'xsd:integer':
        return 'number'
      case 'dcterms:temporal':
      case 'xsd:date':
      case 'xsd:dateTime':
      case 'xsd:duration':
        return 'string'
      default:
        // Composite concept without explicit type → object container for children
        if (concept.narrower && concept.narrower.length > 0) {
          return 'object'
        }
        // Enum and relevantRiepr concepts always resolve to string — no warning needed
        if (concept.relevantCodeList?.length || concept.relevantRiepr?.length) {
          return 'string'
        }
        console.warn(`[ConceptMapper] Unknown relevantDataType for "${concept.id}", falling back to string`)
        return 'string'
    }
  }

  private toCamelCase(str: string): string {
    return str.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase())
  }

  /** Map xsd type to x-jsonld-type range URI for JSON-LD serialization. */
  private mapXJsonLdType(relevantDataType: string | undefined, schemaType: SchemaField['type']): string {
    const xsd = 'http://www.w3.org/2001/XMLSchema#'
    if (relevantDataType) {
      switch (relevantDataType) {
        case 'xsd:string': return `${xsd}string`
        case 'xsd:boolean': return `${xsd}boolean`
        case 'xsd:decimal': return `${xsd}double`
        case 'xsd:integer': return `${xsd}integer`
        case 'xsd:date': return `${xsd}date`
        case 'xsd:dateTime': return `${xsd}dateTime`
        case 'xsd:duration': return `${xsd}duration`
        default: break
      }
    }
    // Fallback for concepts without explicit xsd type
    if (schemaType === 'number') return `${xsd}double`
    if (schemaType === 'boolean') return `${xsd}boolean`
    if (schemaType === 'object') return '@id'
    return `${xsd}string`
  }
}
