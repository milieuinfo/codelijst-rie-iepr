import fs from 'node:fs/promises'
import path from 'node:path'
import { Ajv2020 } from 'ajv/dist/2020.js'

export interface ValidationResult {
  valid: boolean
  filePath: string
  errors?: string[]
}

export class SchemaValidator {
  async validateSchema(filePath: string): Promise<ValidationResult> {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const schema = JSON.parse(content)

      if (typeof schema !== 'object' || schema === null) {
        return { valid: false, filePath, errors: ['Not a valid JSON object'] }
      }

      const ajv = new Ajv2020({ strict: false })
      const valid = ajv.validateSchema(schema) as boolean
      if (!valid && ajv.errors) {
        const errs = ajv.errors.map(
          (e: any) => `${e.instancePath || '/'} ${e.message}`,
        )
        return { valid: false, filePath, errors: errs.length ? errs : [ajv.errors.toString()] }
      }

      return { valid: true, filePath }
    } catch (err) {
      return {
        valid: false,
        filePath,
        errors: [(err as Error).message],
      }
    }
  }

  async validateAll(outDir: string): Promise<ValidationResult[]> {
    const schemaDir = path.resolve(outDir, 'schema')
    const results: ValidationResult[] = []

    const files = await fs.readdir(schemaDir, { recursive: true })
    for (const file of files) {
      if (typeof file === 'string' && file.endsWith('.json')) {
        const fullPath = path.join(schemaDir, file)
        const result = await this.validateSchema(fullPath)
        results.push(result)
      }
    }

    return results
  }

  async validateData(
    schemaPath: string,
    baseSchemaPath: string,
    sampleData: unknown,
  ): Promise<boolean> {
    try {
      const schemaContent = await fs.readFile(schemaPath, 'utf-8')
      const baseContent = await fs.readFile(baseSchemaPath, 'utf-8')
      const schema = JSON.parse(schemaContent)
      const baseSchema = JSON.parse(baseContent)

      const ajv = new Ajv2020({ strict: false })
      ajv.addSchema(baseSchema, baseSchema.$id || baseSchemaPath)
      ajv.addSchema(schema, schema.$id || schemaPath)

      const validate = ajv.getSchema(schema.$id || schemaPath)
      if (!validate) {
        return false
      }

      return !!validate(sampleData)
    } catch {
      return false
    }
  }
}
