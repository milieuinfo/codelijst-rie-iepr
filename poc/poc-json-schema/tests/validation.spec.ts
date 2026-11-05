import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SchemaValidator } from '../src/services/schema-validator.js'
import { BaseSchemaGenerator } from '../src/services/base-schema-generator.js'

describe('Schema file diagnostics (explicit temporary inputs)', () => {
  it('validates newly generated bases and reports malformed input without cached output files', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'riepr-schema-validation-'))
    try {
      const generator = new BaseSchemaGenerator()
      const validator = new SchemaValidator()
      for (const [name, schema] of [['observation', generator.generate()], ['collection', generator.generateCollection()]] as const) {
        const file = path.join(directory, name + '.json')
        await writeFile(file, JSON.stringify(schema))
        expect(await validator.validateSchema(file)).toEqual({ valid: true, filePath: file })
      }
      const malformed = path.join(directory, 'malformed.json')
      await writeFile(malformed, '{"type":')
      expect((await validator.validateSchema(malformed)).valid).toBe(false)
      const invalid = path.join(directory, 'invalid.json')
      await writeFile(invalid, JSON.stringify({ type: 'not-a-type' }))
      const result = await validator.validateSchema(invalid)
      expect(result.valid).toBe(false)
      expect(result.errors?.join(';')).toContain('/type')
      expect((await validator.validateSchema(path.join(directory, 'missing.json'))).errors?.join(';')).toContain('ENOENT')
    } finally { await rm(directory, { recursive: true, force: true }) }
  })

  it('does not swallow missing offline dependencies in the file-based instance API', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'riepr-schema-dependency-'))
    try {
      const schema = path.join(directory, 'schema.json')
      const base = path.join(directory, 'base.json')
      await writeFile(schema, JSON.stringify({ $ref: 'https://example.test/missing-schema' }))
      await writeFile(base, JSON.stringify({ $id: 'https://example.test/base', type: 'object' }))
      await expect(new SchemaValidator().validateData(schema, base, {})).rejects.toThrow(/resolve reference/)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
})
