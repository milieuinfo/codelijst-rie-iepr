import type { CodelistResult, SchemaField } from '../models/index.js'
import { isCollectionClass, isObservationClass, isSourceReportingProfile } from '../config.js'
import { vocabularyIri } from './vocabulary.js'
import { SourceMetadataError } from './generation-report.js'

const sosa = 'http://www.w3.org/ns/sosa/'

/** Separate the source's presentation ownership from Observation/Resultaat ownership. */
export function observationOwnership(input: SchemaField[], result: CodelistResult): SchemaField[] {
  if (!isSourceReportingProfile(result.reportingProfile)) return input
  const fields: SchemaField[] = input.map(field => ({ ...field, extensions: { ...field.extensions } }))
  const byId = new Map(fields.map(field => [field.conceptId, field]))
  const belongsTo = (field: SchemaField, target: string): boolean => {
    const seen = new Set<string>()
    let parent = field.broaderPartitive?.[0]
    while (parent && !seen.has(parent)) {
      if (parent === target) return true
      seen.add(parent)
      parent = byId.get(parent)?.broaderPartitive?.[0]
    }
    return false
  }
  const repeatedScope = (field: SchemaField | undefined): string => {
    const scope: string[] = []
    const seen = new Set<string>()
    while (field && !seen.has(field.conceptId)) {
      seen.add(field.conceptId)
      if (field.isRepeatable) scope.unshift(field.conceptId)
      field = byId.get(field.broaderPartitive?.[0] ?? '')
    }
    return JSON.stringify(scope)
  }
  for (const field of fields) for (const id of field.relevantObservation ?? []) {
    const target = byId.get(id)
    if (!target) throw new Error(`Missing observation ${id} for ${field.conceptId}.`)
    if (!isObservationClass(target.relevantClass) && !isCollectionClass(target.relevantClass)) {
      throw new Error(`relevantObservation target ${id} is not an observation or collection.`)
    }
    if (target === field || belongsTo(target, field.conceptId)) {
      throw new Error(`Cyclic observation ownership for ${field.conceptId}.`)
    }
    if (!belongsTo(field, id) && repeatedScope(byId.get(field.broaderPartitive?.[0] ?? '')) !== repeatedScope(target)) {
      throw new Error(`Observation ownership for ${field.conceptId} crosses repeated record boundaries (${id}).`)
    }
  }
  for (const field of [...fields]) {
    const targets = [...(field.relevantObservation ?? [])].sort((a, b) =>
      Number(byId.get(b)?.isRequired ?? false) - Number(byId.get(a)?.isRequired ?? false))
    for (const [index, target] of targets.entries()) {
      const owned = index === 0 ? field : {
        ...field, conceptId: `${field.conceptId}#target-${index}`,
        extensions: {
          ...field.extensions, 'x-source-concept': undefined,
          'x-derived-from-source': result.expandCurie?.(field.conceptId) ?? field.conceptId,
          'x-ui-hidden': true,
        },
      }
      if (!belongsTo(owned, target)) owned.broaderPartitive = [target]
      if (index) {
        fields.push(owned)
        byId.set(owned.conceptId, owned)
      }
    }
    const parent = byId.get(field.broaderPartitive?.[0] ?? '')
    if (isCollectionClass(parent?.relevantClass) && isObservationClass(field.relevantClass) && !field.relationUri) {
      field.relationUri = sosa + 'hasMember'
      field.extensions!['x-jsonld-id'] = field.relationUri
    }
  }
  for (const observation of [...fields]) {
    if (!isObservationClass(observation.relevantClass) || isCollectionClass(observation.relevantClass)) continue
    const children = fields.filter(child => child.broaderPartitive?.[0] === observation.conceptId)
    if (children.some(child => child.relationUri === sosa + 'hasResult')) continue
    const components = children.filter(child => !child.relationUri?.startsWith(sosa) && !child.extensions?.['x-feature-mapping'])
    if (['number', 'integer'].includes(observation.type)) {
      const value: SchemaField = {
        ...observation, conceptId: observation.conceptId + '#numeric-value',
        propertyName: 'numericValue', relevantClass: undefined, relevantObservation: undefined,
        broaderPartitive: [observation.conceptId], relationUri: vocabularyIri('qudt:numericValue'),
        isRepeatable: false, isRequired: true, uiAfterConceptId: undefined, uiFirst: true,
        extensions: {
          'x-jsonld-id': vocabularyIri('qudt:numericValue'),
          'x-table-order': observation.extensions?.['x-table-order'],
        },
      }
      components.unshift(value)
      fields.push(value)
      observation.type = 'object'
      observation.hasUnitConstraint = undefined
      observation.hasNumericResult = undefined
      observation.extensions!['x-value-path'] = ['hasResult', 'numericValue']
      observation.extensions!['x-scalar-observation'] = true
    }
    if (!components.length) continue
    const resultId = observation.conceptId + '#implicit-result'
    const numeric = components.filter(component => ['number', 'integer'].includes(component.type) && !component.relationUri)
    if (numeric.length === 1 && !components.some(component => component.relationUri === vocabularyIri('qudt:numericValue'))) {
      numeric[0].propertyName = 'numericValue'
      numeric[0].relationUri = vocabularyIri('qudt:numericValue')
      numeric[0].extensions!['x-jsonld-id'] = numeric[0].relationUri
    }
    for (const component of components) {
      component.broaderPartitive = [resultId]
      if (!component.relationUri) {
        throw new SourceMetadataError([{
          code: 'missing-relation', conceptId: component.conceptId,
          message: `Missing relation for ${component.conceptId}. Declare a predicate in the source.`,
        }])
      }
    }
    fields.push({
      conceptId: resultId, propertyName: 'hasResult', label: observation.label,
      type: 'object', isRequired: true, isRepeatable: false,
      broaderPartitive: [observation.conceptId], relevantClass: vocabularyIri('riepr:Resultaat'),
      relationUri: sosa + 'hasResult',
      extensions: {
        'x-jsonld-id': sosa + 'hasResult', 'x-implicit-result': true, 'x-ui-hidden-container': true,
        ...(!components.some(component => component.isRequired) ? { 'x-require-result-content': true } : {}),
      },
    })
  }
  return fields
}
