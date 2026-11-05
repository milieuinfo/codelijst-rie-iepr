import fs from 'node:fs/promises'
import path from 'node:path'
import type { JsonSchemaObject } from '../models/index.js'
import { InstanceValidator } from './instance-validator.js'
export type { InstanceDiagnostic, InstanceValidationResult } from './instance-validator.js'

export interface ValidationResult {
  valid: boolean
  filePath: string
  errors?: string[]
}

export class SchemaValidator extends InstanceValidator {
  async validateSchema(filePath: string): Promise<ValidationResult> {
    try {
      const schema: unknown = JSON.parse(await fs.readFile(filePath, 'utf-8'))
      if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
        return { valid: false, filePath, errors: ['Not a valid JSON Schema object'] }
      }
      const ajv = this.createAjv()
      if (!ajv.validateSchema(schema)) {
        return {
          valid: false, filePath,
          errors: (ajv.errors ?? []).map(error => `${error.instancePath || '/'} ${error.message}`),
        }
      }
      return { valid: true, filePath }
    } catch (error) {
      return { valid: false, filePath, errors: [error instanceof Error ? error.message : String(error)] }
    }
  }

  async validateAll(outDir: string): Promise<ValidationResult[]> {
    const schemaDir = path.resolve(outDir, 'schema')
    const files = await fs.readdir(schemaDir, { recursive: true })
    const results: ValidationResult[] = []
    for (const file of files) {
      if (file.endsWith('.json') && file !== 'index.json') {
        results.push(await this.validateSchema(path.join(schemaDir, file)))
      }
    }
    return results
  }

  async validateData(schemaPath: string, baseSchemaPath: string, sampleData: unknown): Promise<boolean> {
    const schema: JsonSchemaObject = JSON.parse(await fs.readFile(schemaPath, 'utf-8'))
    const base: JsonSchemaObject = JSON.parse(await fs.readFile(baseSchemaPath, 'utf-8'))
    return this.validateInstance(schema, sampleData, [base]).valid
  }
}
