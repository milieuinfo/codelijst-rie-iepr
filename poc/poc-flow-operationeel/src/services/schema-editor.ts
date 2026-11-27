import {
  SchemaRegistry, SchemaValidator, SemanticValidator, schemaObject, pointerToken,
  materializeDerivedValues,
  presentationSchema, transformMemberData, presentationDataPath,
  personalizeReferenceSchema,
  referenceDependency, dependencySelections, referenceMatchesDependency,
  type JsonSchemaObject, type ReferenceRecord, type ReferenceContext,
} from 'codelijst-rie-iepr-poc-json-schema/browser'

export type DataPath = (string | number)[]
export interface EditorColumn { path: string[]; title: string; schema: JsonSchemaObject; required: boolean; presentationOrder?: number }
export interface EditorDiagnostic { instancePath: string; message: string; displayPath?: string }
interface Location { path: DataPath; schema: JsonSchemaObject; value: unknown }
export const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
export const jsonPointer = (path: DataPath): string => path.length ? '/' + path.map(key => pointerToken(String(key))).join('/') : ''
const prefix = (ancestor: DataPath, path: DataPath) => ancestor.length <= path.length && ancestor.every((key, index) => key === path[index])

export class SchemaEditor {
  readonly registry: SchemaRegistry
  readonly inputSchema: JsonSchemaObject
  readonly personalizedSchema: JsonSchemaObject
  readonly draft: Record<string, unknown> = {}
  revision = 0
  diagnostics: EditorDiagnostic[] = []
  private locations?: Location[]

  constructor(
    readonly schema: JsonSchemaObject, readonly dependencies: JsonSchemaObject[] = [],
    readonly references: ReferenceRecord[] = [], readonly referenceContext: ReferenceContext = {},
  ) {
    this.personalizedSchema = personalizeReferenceSchema(schema, { references, referenceContext, dependencies })
    this.inputSchema = presentationSchema(this.personalizedSchema)
    this.registry = new SchemaRegistry(this.inputSchema, dependencies.filter(dependency =>
      dependency.$id !== schema.$id && dependency.$id !== this.personalizedSchema.$id))
    new SchemaValidator().validateInstance(this.personalizedSchema, {})
  }

  resolve(schema: JsonSchemaObject): JsonSchemaObject { return this.registry.resolve(schema) }

  load(data: Record<string, unknown>): void {
    const draft = transformMemberData(this.schema, structuredClone(data), 'presentation')
    if (!isObject(draft)) throw new Error('Een rapport moet een JSON-object zijn.')
    for (const key of Object.keys(this.draft)) delete this.draft[key]
    for (const [key, value] of Object.entries(draft)) Object.defineProperty(this.draft, key, {
      value, writable: true, enumerable: true, configurable: true,
    })
    this.revision++
    this.locations = undefined
    this.diagnostics = []
  }

  get(path: DataPath): unknown {
    return path.reduce<unknown>((value, key) =>
      (isObject(value) || Array.isArray(value)) && Object.hasOwn(value, key) ? Reflect.get(value, key) : undefined, this.draft)
  }

  set(path: DataPath, value: unknown): void {
    if (!path.length) throw new Error('Een veldpad mag niet leeg zijn.')
    let parent: Record<string, unknown> | unknown[] = this.draft
    for (let index = 0; index < path.length - 1; index++) {
      const key = path[index]
      let child: unknown = Reflect.get(parent, key)
      if (child === undefined) {
        child = typeof path[index + 1] === 'number' ? [] : {}
        Reflect.set(parent, key, child)
      }
      if (!isObject(child) && !Array.isArray(child)) throw new Error(`Geen record op ${jsonPointer(path.slice(0, index + 1))}.`)
      parent = child
    }
    if (value === undefined) Reflect.deleteProperty(parent, path[path.length - 1])
    else Reflect.set(parent, path[path.length - 1], value)
    this.revision++
    this.locations = undefined
    this.diagnostics = []
  }

  add(path: DataPath, node: JsonSchemaObject): void {
    const value = this.get(path)
    if (value !== undefined && !Array.isArray(value)) throw new Error(`Geen lijst op ${jsonPointer(path)}.`)
    const item = this.resolve(schemaObject(this.resolve(node).items))
    this.set(path, [...(value ?? []), item.type === 'object' ? {} : item.type === 'array' ? [] : ''])
  }

  remove(path: DataPath, index: number): void {
    const value = this.get(path)
    if (!Array.isArray(value) || index < 0 || index >= value.length) throw new Error('Onbestaande rij.')
    this.set(path, value.filter((_, position) => position !== index))
  }

  columns(node: JsonSchemaObject, path: string[] = [], title = '', required = false): EditorColumn[] {
    const visit = (node: JsonSchemaObject, path: string[], title: string, required: boolean, order?: number): EditorColumn[] => {
      const schema = this.resolve(node)
      if (schema['x-ui-hidden']) return []
      if (typeof schema['x-table-order'] === 'number') order = schema['x-table-order']
      if (schema.type !== 'object') return [{ path, title: title || schema.title || 'Waarde', schema, required, presentationOrder: order }]
      return Object.entries(schema.properties ?? {}).flatMap(([name, value]) => {
        const child = this.resolve(schemaObject(value))
        if (name === 'propertyID' && child.const !== undefined) return []
        const label = child.title || (name === 'hasUnit' || name === 'unitCode' ? 'Eenheid'
          : name === 'numericValue' || name === 'value' ? title || name : name)
        return visit(child, [...path, name], label, schema.required?.includes(name) ?? false, order)
      })
    }
    const columns = visit(node, path, title, required)
    if (columns.some(column => column.presentationOrder !== undefined)) {
      columns.sort((a, b) => (a.presentationOrder ?? Infinity) - (b.presentationOrder ?? Infinity))
    }
    for (const unit of columns.filter(column => ['hasUnit', 'unitCode'].includes(column.path.at(-1) ?? ''))) {
      const value = columns.find(column => ['numericValue', 'value'].includes(column.path.at(-1) ?? '') &&
        JSON.stringify(column.path.slice(0, -1)) === JSON.stringify(unit.path.slice(0, -1)))
      if (value) {
        columns.splice(columns.indexOf(unit), 1)
        columns.splice(columns.indexOf(value) + 1, 0, unit)
      }
    }
    return columns
  }

  schemaAt(path: DataPath): JsonSchemaObject {
    return path.reduce((schema, key) => this.resolve(schemaObject(typeof key === 'number'
      ? schema.items : schema.properties?.[key])), this.resolve(this.inputSchema))
  }

  referenceChoices(path: DataPath, choices: unknown[]): unknown[] {
    const node = this.schemaAt(path)
    const item = node.type === 'array' ? this.resolve(schemaObject(node.items)) : node
    const dependency = referenceDependency(item)
    if (!dependency) return choices
    const scopes = []
    for (let depth = path.length - 1; depth >= 0; depth--) {
      const here = path.slice(0, depth)
      const schema = this.schemaAt(here)
      if (schema.type === 'object') scopes.push({ schema, value: this.get(here) })
    }
    const selected = dependencySelections(dependency, scopes, schema => this.resolve(schema))
    return choices.filter(id => {
      const reference = this.references.find(reference => reference.id === id)
      return reference && referenceMatchesDependency(reference, dependency, selected)
    })
  }

  isActive(path: DataPath, active = new Set<string>()): boolean {
    for (let depth = 0; depth <= path.length; depth++) {
      const here = path.slice(0, depth)
      const node = this.schemaAt(here)
      const condition = node['x-visible-when']
      if (condition === undefined) continue
      if (!isObject(condition) || typeof condition.sourceConcept !== 'string' || !Array.isArray(condition.values)) {
        throw new Error(`Ongeldige schemavoorwaarde op ${jsonPointer(here)}.`)
      }
      const id = jsonPointer(here)
      if (active.has(id)) throw new Error(`Cyclische schemavoorwaarde op ${id}.`)
      const candidates = this.sourceLocations().filter(location =>
        location.schema['x-source-concept'] === condition.sourceConcept &&
        location.path.every((key, index) => typeof key !== 'number' || prefix(location.path.slice(0, index + 1), here)))
      const distance = (location: Location) => {
        let length = 0
        while (length < Math.min(here.length, location.path.length) && here[length] === location.path[length]) length++
        return length
      }
      candidates.sort((left, right) => distance(right) - distance(left))
      const trigger = candidates[0]
      if (!trigger || (candidates[1] && distance(trigger) === distance(candidates[1]))) {
        throw new Error(`Onopgeloste of dubbelzinnige schemavoorwaarde op ${id}.`)
      }
      const next = new Set(active).add(id)
      if (!this.isActive(trigger.path, next)) return false
      const valuePath = trigger.schema['x-value-path']
      let value = trigger.value === undefined ? trigger.schema.const : trigger.value
      if (valuePath !== undefined) {
        if (!Array.isArray(valuePath) || !valuePath.every(key => typeof key === 'string')) throw new Error('Ongeldig x-value-path.')
        for (const key of valuePath) value = isObject(value) ? value[key] : undefined
      }
      const values = Array.isArray(value) ? value : [value]
      const expectedValues = condition.values
      if (!values.some(value => expectedValues.some(expected => Object.is(value, expected)))) return false
    }
    return true
  }

  project(): Record<string, unknown> {
    const hasInput = (node: JsonSchemaObject, value: unknown): boolean => {
      const schema = this.resolve(node)
      if (value === undefined || schema.const !== undefined) return false
      if (schema.type === 'object' && isObject(value)) {
        return Object.entries(schema.properties ?? {}).some(([name, child]) => hasInput(schemaObject(child), value[name]))
      }
      return true
    }
    const visit = (node: JsonSchemaObject, value: unknown, path: DataPath, required: boolean): unknown => {
      const schema = this.resolve(node)
      if (!this.isActive(path)) return undefined
      if (schema.const !== undefined) return value === undefined ? schema.const : value
      if (schema.type === 'object') {
        if (value !== undefined && !isObject(value)) return value
        const object = value ?? {}
        const output: Record<string, unknown> = {}
        let meaningful = false
        for (const [name, child] of Object.entries(schema.properties ?? {})) {
          const resolved = this.resolve(schemaObject(child))
          if (name === 'hasUnit' && resolved.const !== undefined && schema.properties?.numericValue &&
              !schema.required?.includes(name) && object.numericValue === undefined && object[name] === undefined) continue
          const projected = visit(resolved, object[name], [...path, name], schema.required?.includes(name) ?? false)
          if (projected !== undefined) {
            output[name] = projected
            if (hasInput(resolved, projected)) meaningful = true
          }
        }
        return required || meaningful ? output : undefined
      }
      if (schema.type === 'array' && Array.isArray(value)) {
        if (!value.length && !required) return undefined
        return value.map((item, index) => visit(schemaObject(schema.items), item, [...path, index], true))
      }
      return value
    }
    const output = visit(this.inputSchema, this.draft, [], true)
    if (!isObject(output)) throw new Error('Een rapport moet een JSON-object zijn.')
    const materialized = materializeDerivedValues(this.schema, transformMemberData(this.schema, output, 'canonical'), this.dependencies)
    if (!isObject(materialized)) throw new Error('Een rapport moet een JSON-object zijn.')
    return materialized
  }

  validate(): { data: Record<string, unknown>; diagnostics: EditorDiagnostic[] } {
    const data = this.project()
    const structural = new SchemaValidator().validateInstance(this.personalizedSchema, data)
    const diagnostics = structural.errors.map(error => ({
      instancePath: error.property ? `${error.instancePath}/${pointerToken(error.property)}` : error.instancePath,
      message: error.message,
      keyword: error.keyword,
    }))
    diagnostics.push(...new SemanticValidator().validate(this.schema, data, {
      dependencies: this.dependencies, references: this.references, referenceContext: this.referenceContext,
    }).map(error => ({ instancePath: error.instancePath, message: error.message, keyword: error.keyword })))
    this.diagnostics = diagnostics.map(error => {
      const path = error.instancePath ? error.instancePath.slice(1).split('/').map(token =>
        /^(0|[1-9]\d*)$/.test(token) ? Number(token) : token.replace(/~1/g, '/').replace(/~0/g, '~')) : []
      const presentationPath = presentationDataPath(this.schema, data, path)
      const target = this.validationTarget(presentationPath)
      const message = this.validationMessage(target)
      const displayPath = message && this.groupDisplayPath(target, error.keyword)
      return {
        instancePath: jsonPointer(target),
        message: message ?? error.message,
        ...(displayPath ? { displayPath } : {}),
      }
    })
    return { data, diagnostics: this.diagnostics }
  }

  private groupDisplayPath(path: DataPath, keyword: string): string | undefined {
    if (keyword !== 'required' && keyword !== 'minItems') return undefined
    let node = this.resolve(this.inputSchema)
    const labels: string[] = []
    for (const key of path) {
      const next = typeof key === 'number' ? node.items : node.properties?.[key]
      if (!next || typeof next !== 'object') return undefined
      node = this.resolve(schemaObject(next))
      if (typeof key === 'number') labels.push(`rij ${key + 1}`)
      else if (node.title && node['x-source-concept'] && !node['x-ui-hidden-container']) labels.push(node.title)
    }
    if (node.type !== 'array' || !node.title || !node.items ||
        this.resolve(schemaObject(node.items)).type !== 'object') return undefined
    return labels.length ? labels.join(' › ') : node.title
  }

  private validationTarget(path: DataPath): DataPath {
    let node = this.resolve(this.inputSchema)
    for (const key of path) {
      const next = typeof key === 'number' ? node.items : node.properties?.[key]
      if (!next || typeof next !== 'object') return path
      node = this.resolve(schemaObject(next))
    }
    const valuePath = node['x-value-path']
    if (node.type === 'object' && typeof node['x-validation-message'] === 'string' &&
        Array.isArray(valuePath) && valuePath.every(key => typeof key === 'string')) return [...path, ...valuePath]
    return path
  }

  private validationMessage(path: DataPath): string | undefined {
    let node = this.resolve(this.inputSchema)
    let message: string | undefined
    for (let depth = 0; depth <= path.length; depth++) {
      const remaining = path.slice(depth)
      const valuePath = node['x-value-path']
      const matchesValue = Array.isArray(valuePath) && remaining.length === valuePath.length &&
        valuePath.every((key, index) => key === remaining[index])
      if ((!remaining.length || matchesValue) && typeof node['x-validation-message'] === 'string' &&
          node['x-validation-message'].trim()) message = node['x-validation-message']
      if (!remaining.length) break
      const next = typeof remaining[0] === 'number' ? node.items : node.properties?.[remaining[0]]
      if (!next || typeof next !== 'object') break
      node = this.resolve(schemaObject(next))
    }
    return message
  }

  private sourceLocations(): Location[] {
    if (this.locations) return this.locations
    const result: Location[] = []
    const walk = (node: JsonSchemaObject, path: DataPath, parentSource?: unknown) => {
      const schema = this.resolve(node)
      const source = schema['x-source-concept']
      if (source && source !== parentSource) result.push({ path, schema, value: this.get(path) })
      if (schema.type === 'object') {
        for (const [name, child] of Object.entries(schema.properties ?? {})) walk(schemaObject(child), [...path, name], source)
      } else if (schema.type === 'array') {
        const values = this.get(path)
        if (Array.isArray(values)) values.forEach((_, index) => walk(schemaObject(schema.items), [...path, index], source))
      }
    }
    walk(this.inputSchema, [])
    this.locations = result
    return result
  }
}
