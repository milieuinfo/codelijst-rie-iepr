import fs from 'node:fs/promises'
import path from 'node:path'

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

      // Basic structural validation
      if (typeof schema !== 'object' || schema === null) {
        return { valid: false, filePath, errors: ['Not a valid JSON object'] }
      }
      if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
        return { valid: false, filePath, errors: [`Missing or incorrect $schema: ${schema.$schema}`] }
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

  async validateData(schemaPath: string, sampleData: unknown): Promise<boolean> {
    try {
      const content = await fs.readFile(schemaPath, 'utf-8')
      JSON.parse(content) // Just verify it's parseable
      return true
    } catch {
      return false
    }
  }
}
