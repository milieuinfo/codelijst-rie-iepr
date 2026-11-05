import type { Concept, CodelistResult, SchemaField } from '../models/index.js'
import { EnumGenerator } from './enum-generator.js'
import { localName, vocabularyIri } from './vocabulary.js'
import { SourceMetadataError } from './generation-report.js'

export class ConceptMapper {
  private readonly result: CodelistResult
  private readonly enumGen: EnumGenerator

  constructor(result: CodelistResult) {
    this.result = result
    this.enumGen = new EnumGenerator(result)
  }

  mapConcept(concept: Concept): SchemaField | null {
    if (!concept.id || !concept.prefLabel) return null

    const type = this.mapDataType(concept)
    const isRequired = concept.isVerplicht === true
    const isRepeatable = concept.isMeervoudig === true

    // Property name derived from relation predicate if present, else from concept ID
    const propertyName = concept.relation ? this.derivePropertyNameFromRelation(concept.relation) : this.derivePropertyName(concept)

    // Collisions are resolved within each owning object, never by global traversal order.
    const relation = concept.relation ? this.expandVocabulary(concept.relation) : undefined
    const datatype = concept.relevantDataType ? this.expandVocabulary(concept.relevantDataType) : undefined

    const label = concept.prefLabel
    const description = concept.definition || concept.note || undefined

    const schemaField: SchemaField = {
      conceptId: concept.id,
      propertyName,
      label,
      description,
      type,
      isRequired,
      isRepeatable,
      isMultiselect: concept.isMultiselect === true,
      broaderPartitive: concept.broaderPartitive,
      narrower: concept.narrower,
      relevantClass: concept.relevantClass ? this.expandVocabulary(concept.relevantClass) : undefined,
      relevantObservation: concept.relevantObservation,
      isFeatureOfInterest: relation === vocabularyIri('sosa:hasFeatureOfInterest'),
      isHasResult: relation === vocabularyIri('sosa:hasResult'),
      isObservedProperty: relation === vocabularyIri('sosa:observedProperty'),
      isUsedProcedure: relation === vocabularyIri('sosa:usedProcedure'),
      isMadeBySensor: relation === vocabularyIri('sosa:madeBySensor'),
      isResultTime: relation === vocabularyIri('sosa:resultTime'),
      isPhenomenonTime: relation === vocabularyIri('sosa:phenomenonTime'),
      isSimpleResult: relation === vocabularyIri('sosa:hasSimpleResult'),
      extensions: { 'x-source-concept': this.result.expandCurie?.(concept.id) ?? concept.id },
    }
    if (concept.isOnzichtbaar) {
      schemaField.extensions!['x-ui-hidden-container'] = true
      if (type !== 'object') schemaField.extensions!['x-ui-hidden'] = true
    }
    if (concept.tableWorkbook) schemaField.extensions!['x-table-workbook'] = concept.tableWorkbook
    if (concept.tableSheet) schemaField.extensions!['x-table-sheet'] = concept.tableSheet
    if (concept.tableOrder !== undefined) schemaField.extensions!['x-table-order'] = concept.tableOrder
    if (concept.relevantObservation?.length) {
      schemaField.extensions!['x-relevant-observations'] = concept.relevantObservation.map(value =>
        this.result.expandCurie?.(value) ?? value)
    }
    if (concept.relevantFeatureClass?.length) {
      schemaField.extensions!['x-relevant-feature-classes'] = concept.relevantFeatureClass.map(value =>
        this.result.expandCurie?.(value) ?? value)
    }
    if (datatype) {
      schemaField.extensions!['x-source-datatype'] = datatype
      const formats: Record<string, string> = {
        [vocabularyIri('xsd:date')]: 'date',
        [vocabularyIri('xsd:dateTime')]: 'date-time',
        [vocabularyIri('xsd:duration')]: 'duration',
      }
      schemaField.format = formats[datatype]
    }
    if (concept.relevantRiepr?.length) {
      schemaField.extensions!['x-reference-types'] = concept.relevantRiepr.map(value =>
        this.result.expandCurie?.(value) ?? value,
      )
    }
    if (concept.relevantCodeList?.length) {
      schemaField.extensions!['x-code-lists'] = concept.relevantCodeList.map(value =>
        this.result.expandCurie?.(value) ?? value,
      )
    }
    if (concept.related?.length) {
      schemaField.extensions!['x-related-concepts'] = concept.related.map(value =>
        this.result.expandCurie?.(value) ?? value,
      )
    }

    // JSON-LD annotations from relation (x-jsonld-id, x-jsonld-type)
    if (concept.relation) {
      const expandedUri = relation!
      schemaField.relationUri = expandedUri
      schemaField.extensions = {
        ...(schemaField.extensions || {}),
        'x-jsonld-id': expandedUri,
        'x-jsonld-type': this.mapXJsonLdType(concept.relevantDataType, type),
      }
    }

    // Enum resolution from relevantCodeList
    if (concept.relevantCodeList && concept.relevantCodeList.length > 0) {
      const enumRes = this.enumGen.resolveEnums(concept)
      if (enumRes.resolved && enumRes.values.length > 0) {
        schemaField.enumValues = enumRes.values
      } else {
        throw new SourceMetadataError([{
          code: 'unresolved-code-list', conceptId: concept.id,
          message: `${concept.id}: ${enumRes.warning ?? 'Code list has no usable values.'}`,
        }])
      }
    }

    // Unit constraints from relevantUnit
    if (concept.relevantUnit && concept.relevantUnit.length > 0) {
      const units = concept.relevantUnit.flatMap(unit => {
        const collection = [...this.result.collections].find(([id]) =>
          (this.result.expandCurie?.(id) ?? id) === (this.result.expandCurie?.(unit) ?? unit))
        if (collection) {
          if (!collection[1].length) throw new SourceMetadataError([{
            code: 'unresolved-unit', conceptId: concept.id, message: `Empty unit collection ${unit} on ${concept.id}.`,
          }])
          return collection[1].map(value => this.result.expandCurie?.(value) ?? value)
        }
        const collectionPrefix = this.result.expandCurie?.('collectie:') ?? 'collectie:'
        if (unit.startsWith(collectionPrefix)) throw new SourceMetadataError([{
          code: 'unresolved-unit', conceptId: concept.id, message: `Unresolved unit collection ${unit} on ${concept.id}.`,
        }])
        return [this.result.expandCurie?.(unit) ?? unit]
      })
      if (units.some(u => u.includes('TODO'))) {
        throw new SourceMetadataError([{
          code: 'unresolved-unit', conceptId: concept.id,
          message: `Unresolved unit references for "${label}" (${concept.id}).`,
        }])
      } else if (units.length === 1) {
        schemaField.hasUnitConstraint = { type: 'const', value: units[0] }
      } else {
        schemaField.hasUnitConstraint = { type: 'enum', values: units }
      }
    }

    // Numeric data types imply hasResult.numericValue (skip for enum/relevantRiepr concepts)
    if (!concept.relevantCodeList?.length && !concept.relevantRiepr?.length && (type === 'number' || type === 'integer')) {
      schemaField.hasNumericResult = true
    }

    // Min/max value constraints from codelist
    if (concept.minValue !== undefined) schemaField.minimum = concept.minValue
    if (concept.maxValue !== undefined) schemaField.maximum = concept.maxValue

    // Condition path/value for conditional visibility
    if (concept.conditionPath && concept.conditionValue !== undefined) {
      schemaField.condition = {
        path: concept.conditionPath,
        values: [concept.conditionValue],
      }
    }

    // CSOR semantics of the value: what is measured (kwantificeerbaar aspect), in which
    // drager and how (soort waardebepaling), of the stof selected in the variabele field
    const csor: Record<string, string | undefined> = {
      'x-kwantiteitsaspect': concept.kwantiteitsAspect,
      'x-drager': concept.drager,
      'x-soortwaardebepaling': concept.soortWaartbepaling,
    }
    for (const [key, curie] of Object.entries(csor)) {
      if (curie) {
        schemaField.extensions = { ...(schemaField.extensions || {}), [key]: this.result.expandCurie?.(curie) ?? curie }
      }
    }
    if (concept.variabele) {
      schemaField.variabeleConceptId = concept.variabele
    }

    // UI ordering annotations (x-ui-first / x-ui-after)
    if (concept.uiFirst === true) {
      schemaField.uiFirst = true
    }
    if (concept.uiAfter) {
      schemaField.uiAfterConceptId = concept.uiAfter
    }
    if (concept.relevantCodeList?.length || concept.relevantRiepr?.length) {
      schemaField.extensions!['x-jsonld-type'] = '@id'
    }
    if (concept.relevantFeatureClass?.length && concept.relevantRiepr?.length) {
      schemaField.extensions!['x-feature-mapping'] = {
        relation,
        classes: schemaField.extensions!['x-relevant-feature-classes'],
        referenceTypes: schemaField.extensions!['x-reference-types'],
      }
      // These are picker inputs for one constructed feature, not several shared features.
      delete schemaField.extensions!['x-jsonld-id']
      schemaField.relationUri = undefined
    }

    return schemaField
  }

  derivePropertyName(concept: Concept): string {
    return this.derivePropertyNameFromId(concept.id)
  }

  derivePropertyNameFromId(id: string): string {
    const localPart = localName(id)
    return this.toCamelCase(localPart.replace(/[-_]/g, '_'))
  }

  /** Derive JSON property name from a relation predicate (e.g. "sosa:usedProcedure" → "usedProcedure"). */
  derivePropertyNameFromRelation(relation: string): string {
    return localName(this.expandVocabulary(relation))
  }

  private mapDataType(concept: Concept): SchemaField['type'] {
    if (concept.relevantCodeList?.length || concept.relevantRiepr?.length) return 'string'
    const datatype = concept.relevantDataType ? this.expandVocabulary(concept.relevantDataType) : undefined
    switch (datatype) {
      case 'http://www.w3.org/2001/XMLSchema#string':
        return 'string'
      case 'http://www.w3.org/2001/XMLSchema#boolean':
        return 'boolean'
      case 'http://www.w3.org/2001/XMLSchema#decimal':
        return 'number'
      case 'http://www.w3.org/2001/XMLSchema#integer':
        return 'integer'
      case 'http://purl.org/dc/terms/temporal':
        return 'object'
      case 'http://www.w3.org/2001/XMLSchema#date':
      case 'http://www.w3.org/2001/XMLSchema#dateTime':
      case 'http://www.w3.org/2001/XMLSchema#duration':
        return 'string'
      default:
        if (datatype) throw new SourceMetadataError([{
          code: 'unsupported-datatype', conceptId: concept.id,
          message: `Unsupported datatype ${datatype} on ${concept.id}.`,
        }])
        // Composite concept without explicit type → object container for children
        if (concept.relevantClass || concept.narrower?.length ||
            [...this.result.concepts.values()].some(child => child.broaderPartitive?.includes(concept.id))) {
          return 'object'
        }
        // Enum and relevantRiepr concepts always resolve to string — no warning needed
        if (concept.relevantCodeList?.length || concept.relevantRiepr?.length) {
          return 'string'
        }
        throw new SourceMetadataError([{
          code: 'missing-datatype', conceptId: concept.id,
          message: `Missing or unsupported datatype for ${concept.id}: ${concept.relevantDataType ?? '(none)'}.`,
        }])
    }
  }

  private toCamelCase(str: string): string {
    return str.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase())
  }

  /** Map xsd type to x-jsonld-type range URI for JSON-LD serialization. */
  private mapXJsonLdType(relevantDataType: string | undefined, schemaType: SchemaField['type']): string {
    const xsd = 'http://www.w3.org/2001/XMLSchema#'
    if (relevantDataType) {
      const datatype = this.expandVocabulary(relevantDataType)
      if (datatype.startsWith(xsd)) return datatype
    }
    // Fallback for concepts without explicit xsd type
    if (schemaType === 'number') return `${xsd}decimal`
    if (schemaType === 'integer') return `${xsd}integer`
    if (schemaType === 'boolean') return `${xsd}boolean`
    if (schemaType === 'object') return '@id'
    return `${xsd}string`
  }

  private expandVocabulary(value: string): string {
    return vocabularyIri(this.result.expandCurie?.(value) ?? value)
  }
}
