import type { CodelistResult, JsonSchemaObject, JsonSchemaValue, SchemaField, SubSchema } from '../models/index.js'
import type { ThemeChain } from './theme-resolver.js'
import { config, isCollectionClass, isObservationClass, isSourceReportingProfile } from '../config.js'
import { localName, vocabularyIri } from './vocabulary.js'
import { schemaObject } from './schema-registry.js'
import { SourceMetadataError } from './generation-report.js'
import { canonicalMemberSchema } from './member-layout.js'

interface Location {
  field: SchemaField
  parents: SchemaField[]
  schema: JsonSchemaObject
}

const sosa = 'http://www.w3.org/ns/sosa/'
export const homogeneousProperties = [
  'hasFeatureOfInterest', 'hasUltimateFeatureOfInterest', 'madeBySensor',
  'observedProperty', 'phenomenonTime', 'resultTime', 'usedProcedure',
].map(name => sosa + name)

export class SchemaAssembler {
  // The legacy base is no longer inherited: a navigation context is not an Observation.
  constructor(private readonly baseSchema: JsonSchemaObject) {}

  assemble(
    themeName: string,
    fields: SchemaField[],
    _legacyConditionals: JsonSchemaObject | null,
    chain: ThemeChain,
    result: CodelistResult,
  ): { baseSchema: JsonSchemaObject; domainSchema: JsonSchemaObject; subSchemas: SubSchema[] } {
    const slug = chain.slug ?? this.slug(chain.themeConcept.id)
    const domainId = `${config.baseSchemaUrl}/${slug}/schema.json`
    const domainSchema = this.document(fields, domainId, themeName, chain, result)
    const sections = fields.filter(field => (field.children?.length || isObservationClass(field.relevantClass)) && !field.extensions?.['x-reference-types'])
    const context = fields.filter(field => !sections.includes(field))
    const subSchemas = sections.map(field => {
      const name = this.slug(field.conceptId)
      const schema = this.document([...context, field], `${config.baseSchemaUrl}/${slug}/${name}/schema.json`, field.label, chain, result)
      schema['x-section-concept'] = result.expandCurie?.(field.conceptId) ?? field.conceptId
      const workbooks = new Set<string>()
      const collect = (field: SchemaField) => {
        const workbook = field.extensions?.['x-table-workbook']
        if (typeof workbook === 'string') workbooks.add(workbook)
        field.children?.forEach(collect)
      }
      collect(field)
      if (workbooks.size > 1) throw new Error(`Multiple workbooks declared for ${field.conceptId}: ${[...workbooks].join(', ')}.`)
      if (workbooks.size) schema['x-table-workbook'] = [...workbooks][0]
      return { name, schema }
    })
    return { baseSchema: this.baseSchema, domainSchema, subSchemas }
  }

  private document(fields: SchemaField[], id: string, title: string, chain: ThemeChain, result: CodelistResult): JsonSchemaObject {
    const locations = new Map<string, Location>()
    const objectSchemas = new Map<string, JsonSchemaObject>()
    const root = this.object(fields, [], locations, objectSchemas, result)
    for (const location of locations.values()) {
      const field = location.field
      const key = field.extensions?.['x-table-key']
      if (key !== undefined) {
        if (!Array.isArray(key) || !key.length || !key.every(value => typeof value === 'string') ||
            new Set(key).size !== key.length) throw new Error(`Invalid table key on ${field.conceptId}.`)
        for (const source of key) {
          const component = [...locations.values()].find(candidate =>
            (result.expandCurie?.(candidate.field.conceptId) ?? candidate.field.conceptId) === source)
          const owner = component?.parents.findIndex(parent => parent.conceptId === field.conceptId) ?? -1
          if (!component || owner < 0 ||
              component.parents.slice(owner + 1).some(parent => parent.isRepeatable) ||
              component.field.children?.length || component.field.hasUnitConstraint ||
              !['string', 'number', 'integer', 'boolean'].includes(component.field.type)) {
            throw new Error(`Table key ${source} must be a scalar or selection within ${field.conceptId}, not an independent record.`)
          }
        }
      }
      if (Boolean(field.referenceParentConceptId) !== Boolean(field.referenceRelation)) {
        throw new SourceMetadataError([{ code: 'invalid-source-reference', conceptId: field.conceptId,
          message: 'referenceParent and referenceRelation must be declared together.' }])
      }
      if (field.referenceParentConceptId) {
        const seen = new Set([field.conceptId])
        let current: SchemaField | undefined = field
        while (current?.referenceParentConceptId) {
          if (seen.has(current.referenceParentConceptId)) throw new Error(`Cyclic reference dependency on ${field.conceptId}.`)
          seen.add(current.referenceParentConceptId)
          current = locations.get(current.referenceParentConceptId)?.field
        }
        const parent = locations.get(field.referenceParentConceptId)
        if (!parent || parent === location || !field.extensions?.['x-reference-types'] ||
            !parent.field.extensions?.['x-reference-types'] ||
            (parent.field.isRepeatable && Boolean(parent.field.children?.length))) {
          throw new Error(`Invalid referenceParent ${field.referenceParentConceptId} on ${field.conceptId}.`)
        }
        let common = 0
        while (common < location.parents.length && common < parent.parents.length &&
          location.parents[common].conceptId === parent.parents[common].conceptId) common++
        if (parent.parents.slice(common).some(ancestor => ancestor.isRepeatable)) {
          throw new Error(`Reference dependency ${field.conceptId} crosses independent record arrays.`)
        }
        location.schema['x-reference-dependency'] = {
          sourceConcept: result.expandCurie?.(parent.field.conceptId) ?? parent.field.conceptId,
          relation: field.referenceRelation,
        }
        if (location.schema.items) schemaObject(location.schema.items)['x-reference-dependency'] =
          location.schema['x-reference-dependency']
      }
      if (field.variabeleConceptId) {
        const variable = locations.get(field.variabeleConceptId)
        if (!variable) throw new Error(`Unresolved variable ${field.variabeleConceptId} on ${field.conceptId}.`)
        if (variable.field.children?.length || variable.field.isRepeatable || variable.field.isMultiselect) {
          throw new Error(`Variable ${field.variabeleConceptId} on ${field.conceptId} must be a scalar value.`)
        }
        let common = 0
        while (common < location.parents.length && common < variable.parents.length &&
          location.parents[common].conceptId === variable.parents[common].conceptId) common++
        if (variable.parents.slice(common).some(parent => parent.isRepeatable || parent.isMultiselect)) {
          throw new Error(`Variable ${field.variabeleConceptId} on ${field.conceptId} crosses independent record arrays.`)
        }
        location.schema['x-variabele'] = variable.field.propertyName
        location.schema['x-variable-location'] = {
          ancestorDepth: location.parents.length - common,
          path: [...variable.parents.slice(common).map(parent => parent.propertyName),
            variable.field.propertyName, ...this.valuePath(variable.schema)],
        }
      }
      if (field.condition) this.condition(root, location, field.condition.values, field.isRequired, locations, objectSchemas, result)
    }
    const schema = canonicalMemberSchema({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: id,
      title,
      ...root,
      'x-theme-concept': result.expandCurie?.(chain.themeConcept.id) ?? chain.themeConcept.id,
      'x-theme-slug': chain.slug ?? this.slug(chain.themeConcept.id),
      'x-theme-label': chain.themeConcept.prefLabel ?? title,
      'x-semantic-profile': 'https://www.w3.org/TR/2020/WD-vocab-ssn-ext-20200116/',
      'x-flow-transitions': chain.transitions ?? [],
    })
    if (isSourceReportingProfile(result.reportingProfile)) this.requireRelations(schema, true)
    return schema
  }

  private requireRelations(node: JsonSchemaObject, envelope = false): void {
    for (const [key, child] of Object.entries(node.properties ?? {})) {
      const property = schemaObject(child)
      const mapping = property['x-feature-mapping'] ??
        (property.items ? schemaObject(property.items)['x-feature-mapping'] : undefined)
      if (!envelope && typeof property['x-jsonld-id'] !== 'string' && !mapping) {
        throw new SourceMetadataError([{
          code: 'missing-relation', conceptId: String(property['x-source-concept'] ?? key),
          message: `Missing relation for ${String(property['x-source-concept'] ?? key)}. Declare a predicate in the source.`,
        }])
      }
      this.requireRelations(property)
    }
    if (node.items) this.requireRelations(schemaObject(node.items))
    for (const variant of Array.isArray(node.oneOf) ? node.oneOf : []) this.requireRelations(schemaObject(variant))
  }

  private object(
    fields: SchemaField[], parents: SchemaField[], locations: Map<string, Location>,
    objects: Map<string, JsonSchemaObject>, result: CodelistResult,
  ): JsonSchemaObject {
    const properties: Record<string, JsonSchemaValue> = {}
    const required: string[] = []
    const object: JsonSchemaObject = { type: 'object', properties, additionalProperties: false }
    objects.set(this.pathKey(parents), object)
    const names = new Set<string>()
    for (const field of fields) {
      if (names.has(field.propertyName)) throw new Error(`Duplicate property ${field.propertyName} at ${field.conceptId}.`)
      names.add(field.propertyName)
      const schema = this.field(field, parents, locations, objects, result)
      properties[field.propertyName] = schema
      locations.set(field.conceptId, { field, parents, schema })
      if (field.isRequired && !field.condition) required.push(field.propertyName)
    }
    const numericValues = fields.filter(field => field.relationUri === vocabularyIri('qudt:numericValue') && field.hasUnitConstraint)
    if (numericValues.length > 1) throw new Error('Multiple numeric values cannot declare different units on the same owning object.')
    for (const field of numericValues) {
      if (properties.hasUnit || fields.some(child => child.relationUri === vocabularyIri('qudt:hasUnit'))) {
        throw new Error(`${field.conceptId}: declare the owning unit once, not both explicitly and through relevantUnit.`)
      }
      if (field.isRepeatable || field.isMultiselect || !['number', 'integer'].includes(field.type)) {
        throw new Error(`${field.conceptId}: a unit-bearing qudt:numericValue must be a scalar number.`)
      }
      properties.hasUnit = this.unit(field.hasUnitConstraint!, 'qudt:hasUnit')
      properties.hasUnit.title = 'Eenheid'
      properties.hasUnit['x-ui-after'] = field.propertyName
      object.dependentRequired = { [field.propertyName]: ['hasUnit'] }
      if (required.includes(field.propertyName)) required.push('hasUnit')
    }
    for (const field of fields) {
      const schema = locations.get(field.conceptId)!.schema
      if (field.uiAfterConceptId) {
        const previous = fields.find(candidate => candidate.conceptId === field.uiAfterConceptId)
        if (previous) schema['x-ui-after'] = previous.propertyName
      }
    }
    if (required.length) object.required = required
    return object
  }

  private field(
    field: SchemaField, parents: SchemaField[], locations: Map<string, Location>,
    objects: Map<string, JsonSchemaObject>, result: CodelistResult,
  ): JsonSchemaObject {
    if (field.isRepeatable && field.isMultiselect) {
      throw new Error(`${field.conceptId}: repeatable records and multiselect cannot be conflated.`)
    }
    let node: JsonSchemaObject
    if (field.children?.length) {
      node = this.object(field.children, [...parents, field], locations, objects, result)
      const sheets = new Set<string>()
      const visit = (child: SchemaField): void => {
        if (child.isRepeatable && child.children?.length) return
        const sheet = child.extensions?.['x-table-sheet']
        if (typeof sheet === 'string') sheets.add(sheet)
        child.children?.forEach(visit)
      }
      field.children.forEach(visit)
      if (sheets.size > 1) throw new SourceMetadataError([{
        code: 'inconsistent-table', conceptId: field.conceptId,
        message: `${field.conceptId}: singleton row fields declare conflicting worksheets: ${[...sheets].join(', ')}.`,
      }])
      if (sheets.size) node['x-table-sheet'] = [...sheets][0]
      if (field.relevantClass) {
        if (!isSourceReportingProfile(result.reportingProfile)) {
          node.properties!['@id'] = { type: 'string', minLength: 1, 'x-ui-hidden': true }
        }
        node['x-jsonld-type'] = field.relevantClass
      }
      if (field.extensions?.['x-scalar-observation']) {
        node.properties!.observedProperty = {
          type: 'string', const: result.expandCurie?.(field.conceptId) ?? field.conceptId,
          'x-jsonld-id': sosa + 'observedProperty', 'x-jsonld-type': '@id', 'x-ui-hidden': true,
        }
        node.required = [...(node.required ?? []), 'observedProperty']
      }
      if (isCollectionClass(field.relevantClass)) this.collection(field, node)
    } else if (field.extensions?.['x-source-datatype'] === vocabularyIri('dcterms:temporal')) {
      node = {
        type: 'object', required: ['start', 'end'], additionalProperties: false,
        properties: { start: { type: 'string' }, end: { type: 'string' } },
        anyOf: ['date', 'date-time'].map(format => ({
          properties: { start: { format }, end: { format } },
        })),
        'x-temporal-range': true,
      }
    } else {
      const value: JsonSchemaObject = { type: field.type }
      if (field.enumValues?.length) value.enum = field.enumValues
      if (field.format) value.format = field.format
      if (field.minimum !== undefined) value.minimum = field.minimum
      if (field.maximum !== undefined) value.maximum = field.maximum
      if (field.pattern) value.pattern = field.pattern
      if (field.relevantClass === vocabularyIri('schema:PropertyValue')) {
        node = {
          type: 'object', additionalProperties: false, required: ['propertyID', 'value'],
          properties: {
            propertyID: {
              type: 'string', const: result.expandCurie?.(field.conceptId) ?? field.conceptId,
              'x-jsonld-id': vocabularyIri('schema:propertyID'), 'x-jsonld-type': '@id',
              'x-ui-hidden': true,
            },
            value: { ...value, ...field.extensions, title: field.label, 'x-jsonld-id': vocabularyIri('schema:value') },
          },
          'x-jsonld-type': field.relevantClass,
          'x-value-path': ['value'],
        }
        if (field.hasUnitConstraint) {
          node.properties!.unitCode = { ...this.unit(field.hasUnitConstraint, 'schema:unitCode'), title: 'Eenheid' }
          node.required!.push('unitCode')
        }
      } else if ((field.hasUnitConstraint && field.relationUri !== vocabularyIri('qudt:numericValue')) ||
        (field.relevantClass === vocabularyIri('riepr:Observatie') && ['number', 'integer'].includes(field.type))) {
        const unit = field.hasUnitConstraint
        const resultClass = field.relevantClass === vocabularyIri('riepr:Observatie')
          ? vocabularyIri('riepr:Resultaat') : vocabularyIri('qudt:QuantityValue')
        node = {
          type: 'object', additionalProperties: false, required: ['numericValue', ...(unit ? ['hasUnit'] : [])],
          properties: {
            numericValue: { ...value, 'x-jsonld-id': vocabularyIri('qudt:numericValue') },
            ...(unit ? { hasUnit: this.unit(unit, 'qudt:hasUnit') } : {}),
          },
          'x-jsonld-type': isObservationClass(field.relevantClass) ? resultClass : field.relevantClass ?? resultClass,
          'x-value-path': ['numericValue'],
        }
      } else {
        node = value
      }
      if (isObservationClass(field.relevantClass)) {
        if (isCollectionClass(field.relevantClass)) {
          throw new Error(`Collection ${field.conceptId} needs explicit hasMember fields.`)
        }
        const valuePath = node['x-value-path']
        node = {
          type: 'object', additionalProperties: false, required: ['observedProperty', 'hasResult'],
          properties: {
            ...(!isSourceReportingProfile(result.reportingProfile)
              ? { '@id': { type: 'string', minLength: 1, 'x-ui-hidden': true } } : {}),
            observedProperty: { const: result.expandCurie?.(field.conceptId) ?? field.conceptId, 'x-jsonld-id': sosa + 'observedProperty', 'x-ui-hidden': true },
            hasResult: { ...node, 'x-jsonld-id': sosa + (node.type === 'object' ? 'hasResult' : 'hasSimpleResult') },
          },
          'x-jsonld-type': field.relevantClass,
          'x-value-path': ['hasResult', ...(Array.isArray(valuePath) ? valuePath : [])],
        }
      }
    }

    const compiledType = node['x-jsonld-type']
    Object.assign(node, field.extensions)
    if (compiledType) node['x-jsonld-type'] = compiledType
    node.title = field.label
    if (field.description) node.description = field.description
    if (node.type === 'object' && field.relevantClass) node['x-jsonld-type'] = field.relevantClass
    if (field.uiFirst) node['x-ui-first'] = true
    if (field.uiAfterConceptId) {
      const sibling = result.concepts.get(field.uiAfterConceptId)
      if (!sibling || (!isSourceReportingProfile(result.reportingProfile) &&
          (sibling.broaderPartitive?.[0] ?? '') !== (field.broaderPartitive?.[0] ?? ''))) {
        throw new Error(`Invalid sibling ordering on ${field.conceptId}.`)
      }
      node['x-ui-after-concept'] = result.expandCurie?.(sibling.id) ?? sibling.id
    }
    if (field.variabeleConceptId) {
      node['x-variable-concept'] = result.expandCurie?.(field.variabeleConceptId) ?? field.variabeleConceptId
    }
    if (field.isRepeatable || field.isMultiselect) {
      const wrapper: JsonSchemaObject = {
        type: 'array', title: field.label, items: node,
        'x-source-concept': node['x-source-concept'],
        'x-array-kind': field.isMultiselect ? 'multiselect' : field.children?.length ? 'records' : 'values',
      }
      if (field.isRequired) wrapper.minItems = 1
      for (const key of ['x-ui-first', 'x-ui-after-concept', 'x-jsonld-id', 'x-table-workbook', 'x-table-sheet', 'x-table-order', 'x-ui-hidden-container']) {
        if (node[key] !== undefined) wrapper[key] = node[key]
      }
      return wrapper
    }
    return node
  }

  private valuePath(schema: JsonSchemaObject): string[] {
    const node = schema.type === 'array' ? schemaObject(schema.items) : schema
    const path = node['x-value-path']
    if (path === undefined) return []
    if (!Array.isArray(path) || !path.every((key): key is string => typeof key === 'string')) {
      throw new Error('Invalid compiled scalar value path.')
    }
    return [...path]
  }

  private unit(unit: NonNullable<SchemaField['hasUnitConstraint']>, predicate: string): JsonSchemaObject {
    return {
      type: 'string',
      ...(unit.type === 'const' ? { const: unit.value, default: unit.value } : { enum: unit.values }),
      'x-jsonld-id': vocabularyIri(predicate), 'x-jsonld-type': '@id',
    }
  }

  private collection(field: SchemaField, schema: JsonSchemaObject): void {
    const invalid = (message: string): never => {
      throw new SourceMetadataError([{ code: 'invalid-observation-context', conceptId: field.conceptId, message }])
    }
    const members = field.children!.filter(child => child.relationUri === sosa + 'hasMember')
    if (!members.length) invalid(`Collection ${field.conceptId} has no explicit sosa:hasMember field.`)
    if (field.children!.some(child => child.relationUri === sosa + 'hasResult' || child.relationUri === sosa + 'hasSimpleResult')) {
      invalid(`Collection ${field.conceptId} cannot own a member result.`)
    }
    for (const property of homogeneousProperties) {
      const shared = field.children!.filter(child => child.relationUri === property)
      if (shared.length > 1 || shared.some(child => child.isRepeatable || child.isMultiselect)) {
        invalid(`Collection ${field.conceptId}: ${property} has maximum cardinality one in the selected profile.`)
      }
    }
    for (const member of members) {
      if (!isObservationClass(member.relevantClass)) {
        invalid(`Invalid collection member ${member.conceptId}: expected Observation or ObservationCollection, not ${member.relevantClass ?? 'an untyped group'}.`)
      }
    }
    schema.anyOf = members.map(member => ({
      required: [member.propertyName],
      ...(member.isRepeatable ? { properties: { [member.propertyName]: { minItems: 1 } } } : {}),
    }))
  }

  private condition(
    root: JsonSchemaObject, target: Location, rawValues: string[], required: boolean,
    locations: Map<string, Location>, objects: Map<string, JsonSchemaObject>, result: CodelistResult,
  ): void {
    const trigger = locations.get(target.field.condition!.path)
    if (!trigger) throw new Error(`Unresolved conditionPath ${target.field.condition!.path} on ${target.field.conceptId}.`)
    if (trigger.field.children?.length && !this.valuePath(trigger.schema).length) throw new Error(`Condition trigger ${trigger.field.conceptId} must be a value.`)
    let common = 0
    while (common < target.parents.length && common < trigger.parents.length &&
           target.parents[common].conceptId === trigger.parents[common].conceptId) common++
    if (trigger.parents.slice(common).some(field => field.isRepeatable || field.isMultiselect)) {
      throw new Error(`Condition ${target.field.conceptId} crosses independent record arrays.`)
    }
    const concept = result.concepts.get(trigger.field.conceptId)
    const datatype = concept?.relevantDataType
      ? vocabularyIri(result.expandCurie?.(concept.relevantDataType) ?? concept.relevantDataType) : undefined
    const values = rawValues.map(raw => {
      if (datatype === vocabularyIri('xsd:boolean')) {
        if (!['true', 'false'].includes(raw)) throw new Error(`Invalid boolean condition "${raw}" on ${target.field.conceptId}.`)
        return raw === 'true'
      }
      if (datatype === vocabularyIri('xsd:integer') || datatype === vocabularyIri('xsd:decimal')) {
        const number = Number(raw)
        if (!/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(raw) || !Number.isFinite(number) ||
            (datatype === vocabularyIri('xsd:integer') && !Number.isSafeInteger(number))) {
          throw new Error(`Invalid numeric condition "${raw}" on ${target.field.conceptId}; use explicit domain data, not NaN.`)
        }
        return number
      }
      const value = trigger.field.enumValues?.length ? result.expandCurie?.(raw) ?? raw : raw
      if (trigger.field.enumValues?.length && !trigger.field.enumValues.includes(value)) {
        throw new Error(`Condition value "${raw}" is not an option of ${trigger.field.conceptId}.`)
      }
      return value
    })
    const match: JsonSchemaObject = values.length === 1 ? { const: values[0] } : { enum: values }
    let valueMatch = match
    for (const key of this.valuePath(trigger.schema).reverse()) {
      valueMatch = { required: [key], properties: { [key]: valueMatch } }
    }
    const triggerValue: JsonSchemaObject = trigger.field.isMultiselect || trigger.field.isRepeatable ? { contains: valueMatch } : valueMatch
    let test: JsonSchemaObject = { required: [trigger.field.propertyName], properties: { [trigger.field.propertyName]: triggerValue } }
    for (const parent of trigger.parents.slice(common).reverse()) {
      test = { required: [parent.propertyName], properties: { [parent.propertyName]: test } }
    }
    const owner = common ? objects.get(this.pathKey(target.parents.slice(0, common)))! : root
    const rule: JsonSchemaObject = { if: test }
    if (required) rule.then = this.targetRule(target, common, { required: [target.field.propertyName] })
    rule.else = this.targetRule(target, common, { properties: { [target.field.propertyName]: { not: {} } } })
    owner.allOf = [...(owner.allOf ?? []), rule]
    target.schema['x-visible-when'] = { sourceConcept: trigger.field.extensions?.['x-source-concept'], values }
  }

  private targetRule(target: Location, common: number, leaf: JsonSchemaObject): JsonSchemaObject {
    let rule = leaf
    for (const parent of target.parents.slice(common).reverse()) {
      rule = { properties: { [parent.propertyName]: parent.isRepeatable || parent.isMultiselect ? { items: rule } : rule } }
    }
    return rule
  }

  private pathKey(parents: SchemaField[]): string {
    return JSON.stringify(parents.map(parent => parent.conceptId))
  }

  private slug(id: string): string {
    const slug = localName(id).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/_/g, '-')
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error(`Unsupported source identifier for schema path: ${id}.`)
    return slug
  }
}
