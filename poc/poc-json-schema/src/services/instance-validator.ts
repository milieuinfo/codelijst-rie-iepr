import { Ajv2020 } from 'ajv/dist/2020.js'
import { default as formats } from 'ajv-formats'
import type { JsonSchemaObject } from '../models/index.js'

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
    const errors = (validate.errors ?? []).map(error => ({
      instancePath: error.instancePath, schemaPath: error.schemaPath,
      keyword: error.keyword, message: error.message ?? error.keyword,
      ...('missingProperty' in error.params ? { property: String(error.params.missingProperty) } : {}),
      ...('additionalProperty' in error.params ? { property: String(error.params.additionalProperty) } : {}),
    }))
    return { valid: !!valid, errors }
  }
}
