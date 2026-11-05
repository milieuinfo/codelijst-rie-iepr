import { Ajv2020 } from 'ajv/dist/2020.js'
import { default as formats } from 'ajv-formats'
import type { JsonSchemaObject } from '../models/index.js'
import { pointerToken, schemaObject } from './schema-registry.js'
import { matchingMemberVariant } from './member-layout.js'

function selectedMemberBranches(schema: JsonSchemaObject, data: unknown) {
  const branches: { schemaPath: string; instancePath: string; index: number }[] = []
  const object = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value)
  const visit = (node: JsonSchemaObject, value: unknown, schemaPath: string, instancePath: string): void => {
    if (Array.isArray(node.oneOf) && node.oneOf.every(variant => {
      const definition = schemaObject(variant)
      const key = definition.properties?.observedProperty ? 'observedProperty' : 'propertyID'
      const observed = schemaObject(definition.properties?.[key])
      return definition.required?.includes(key) &&
        (Object.hasOwn(observed, 'const') || Array.isArray(observed.enum))
    })) {
      const variant = matchingMemberVariant(node, value)
      if (variant) {
        const index = node.oneOf.indexOf(variant)
        branches.push({ schemaPath: `${schemaPath}/oneOf`, instancePath, index })
        visit(variant, value, `${schemaPath}/oneOf/${index}`, instancePath)
      }
    }
    if (node.type === 'array' && Array.isArray(value)) {
      value.forEach((item, index) => visit(schemaObject(node.items), item, `${schemaPath}/items`, `${instancePath}/${index}`))
    } else if (object(value)) {
      for (const [key, child] of Object.entries(node.properties ?? {})) {
        if (Object.hasOwn(value, key)) visit(schemaObject(child), value[key],
          `${schemaPath}/properties/${pointerToken(key)}`, `${instancePath}/${pointerToken(key)}`)
      }
    }
  }
  visit(schema, data, '#', '')
  return branches
}

export interface InstanceDiagnostic {
  instancePath: string
  schemaPath: string
  keyword: string
  message: string
  property?: string
}

export interface InstanceValidationResult {
  valid: boolean
  errors: InstanceDiagnostic[]
}

export class InstanceValidator {
  protected createAjv(): Ajv2020 {
    const ajv = new Ajv2020({ strict: false, allErrors: true })
    formats.default(ajv)
    return ajv
  }

  validateInstance(schema: JsonSchemaObject, data: unknown, registry: JsonSchemaObject[] = []): InstanceValidationResult {
    const ajv = this.createAjv()
    for (const dependency of registry) {
      if (!dependency.$id) throw new Error('Offline schema dependencies must declare $id.')
      if (dependency.$id !== schema.$id) ajv.addSchema(dependency)
    }
    const validate = ajv.compile(schema)
    const valid = validate(data)
    const branches = validate.errors?.length ? selectedMemberBranches(schema, data) : []
    const errors = (validate.errors ?? []).filter(error => branches.every(branch => {
      if (error.instancePath !== branch.instancePath && !error.instancePath.startsWith(branch.instancePath + '/')) return true
      if (error.schemaPath === branch.schemaPath) return false
      if (!error.schemaPath.startsWith(branch.schemaPath + '/')) return true
      return error.schemaPath.startsWith(`${branch.schemaPath}/${branch.index}/`)
    })).map(error => ({
      instancePath: error.instancePath, schemaPath: error.schemaPath,
      keyword: error.keyword, message: error.message ?? error.keyword,
      ...('missingProperty' in error.params ? { property: String(error.params.missingProperty) } : {}),
      ...('additionalProperty' in error.params ? { property: String(error.params.additionalProperty) } : {}),
    }))
    return { valid: !!valid, errors }
  }
}
