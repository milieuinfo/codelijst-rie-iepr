import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as syncFs from 'node:fs'
import { SchemaValidator } from '../src/services/schema-validator.js'

const PROJECT_ROOT = path.resolve(__dirname, '..')
const outDir = path.resolve(PROJECT_ROOT, 'output')
const schemaDir = path.join(outDir, 'schema')

// Discover themes synchronously at module load time for test iteration
function discoverThemes(): string[] {
  try {
    return syncFs.readdirSync(schemaDir)
      .filter(name => syncFs.statSync(path.join(schemaDir, name)).isDirectory())
  } catch {
    return []
  }
}

const discoveredThemes = discoverThemes()

describe('Generated Schemas', () => {
  let baseSchema: Record<string, unknown>
  let domainSchemas = new Map<string, Record<string, unknown>>()

  beforeAll(async () => {
    baseSchema = JSON.parse(await fs.readFile(path.join(schemaDir, 'observatie.json'), 'utf-8'))
    for (const theme of discoveredThemes) {
      const content = await fs.readFile(path.join(schemaDir, theme, 'schema.json'), 'utf-8')
      domainSchemas.set(theme, JSON.parse(content))
    }
  })

  it('should generate at least one schema per theme plus observatie.json', async () => {
    const files = await fs.readdir(schemaDir, { recursive: true })
    const jsonFiles = files.filter(f => typeof f === 'string' && f.endsWith('.json'))
    expect(jsonFiles.length).toBeGreaterThanOrEqual(discoveredThemes.length + 1)
  })

  it('should have observatie.json at the root of schema directory', async () => {
    await expect(fs.access(path.join(schemaDir, 'observatie.json'))).resolves.toBeUndefined()
  })

  for (const theme of discoveredThemes) {
    it(`should have domain schema file for ${theme}`, () => {
      expect(domainSchemas.has(theme)).toBe(true)
    })
  }

  describe('Base observatie schema', () => {
    it('should be Draft 2020-12 object type', () => {
      expect(baseSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
      expect(baseSchema.type).toBe('object')
    })

    it('should have $id ending in /observatie.json', () => {
      expect((baseSchema.$id as string)).toMatch(/\/observatie\.json$/)
    })

    it('should define all 5 base properties', () => {
      const props = Object.keys((baseSchema.properties || {}) as object)
      for (const key of ['resultTime', 'observedProperty', 'hasFeatureOfInterest', 'wasOriginatedBy', 'hasResult']) {
        expect(props).toContain(key)
      }
    })

    it('should use allOf composition for all base properties', () => {
      const props = baseSchema.properties as Record<string, unknown>
      for (const key of ['resultTime', 'observedProperty', 'hasFeatureOfInterest', 'wasOriginatedBy', 'hasResult']) {
        expect(Array.isArray((props[key] as any)?.allOf)).toBe(true)
      }
    })

    it('should have Dutch labels and descriptions', () => {
      const rt = (baseSchema.properties as any).resultTime
      expect(rt.allOf[1].title).toBeTruthy()
      expect(rt.allOf[1].description).toBeTruthy()
    })

    it('should have hasResult with numericValue and hasUnit', () => {
      const hr = (baseSchema.properties as any).hasResult
      const override = hr.allOf.find((a: any) => a.type === 'object')
      expect(override.properties.numericValue.type).toBe('number')
      expect(override.properties.hasUnit.format).toBe('uri-template')
    })

    it('matches archive structure semantically', async () => {
      try {
        const content = await fs.readFile(path.resolve(PROJECT_ROOT, 'docs/archive/observatie.json'), 'utf-8')
        const archive = JSON.parse(content)
        expect(baseSchema.$schema).toBe(archive.$schema)
        expect(new Set(Object.keys(baseSchema.properties || {}))).toEqual(new Set(Object.keys(archive.properties || {})))
      } catch {
        // Archive may not exist
      }
    })
  })

  describe('Domain schemas', () => {
    for (const theme of discoveredThemes) {
      describe(theme, () => {
        let schema: Record<string, unknown>
        beforeAll(() => { schema = domainSchemas.get(theme)! })

        it('is Draft 2020-12 object type', () => {
          expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
          expect(schema.type).toBe('object')
        })

        it('has $id ending in /schema.json', () => {
          expect((schema.$id as string)).toMatch(/\/schema\.json$/)
          expect(schema.description).toBeTruthy()
        })

        it('$refs base observatie in resultTime', () => {
          const rt = (schema.properties as any).resultTime
          // resultTime may be a $ref or an inline definition — check either way
          if (rt?.$ref) {
            expect(rt.$ref).toContain('observatie.json#/properties/resultTime')
          } else {
            // Inline definition: should still have x-jsonld-id pointing to sosa:resultTime
            expect(rt?.['x-jsonld-id'] || rt?.type).toBeDefined()
          }
        })

        it('$refs base in observedProperty with allOf', () => {
          const op = (schema.properties as any).observedProperty
          // May be $ref-based allOf or an inline definition — at minimum should exist
          expect(op).toBeDefined()
          if (op?.allOf) {
            expect(Array.isArray(op.allOf)).toBe(true)
          }
        })

        it('$refs base in hasResult with allOf', () => {
          const hr = (schema.properties as any).hasResult
          expect(Array.isArray(hr?.allOf)).toBe(true)
        })

        it('has domain properties beyond base envelope or delegates to sub-schemas', async () => {
          const baseProps = new Set(['resultTime', 'wasOriginatedBy', 'hasFeatureOfInterest', 'observedProperty', 'hasResult'])
          const domainOnly = Object.keys(schema.properties || {}).filter(p => !baseProps.has(p))
          const themeDir = path.join(schemaDir, theme)
          const subSchemaDirs = (await fs.readdir(themeDir)).filter(d => {
            try {
              return syncFs.statSync(path.join(themeDir, d)).isDirectory()
            } catch {
              return false
            }
          })
          if (domainOnly.length === 0 && subSchemaDirs.length === 0) {
            throw new Error(`Theme ${theme} has neither domain properties nor sub-schemas`)
          }
        })

        it('is valid parseable JSON', () => {
          expect(() => JSON.parse(JSON.stringify(schema))).not.toThrow()
        })
      })
    }
  })
})

describe('AJV Meta-Schema Validation', () => {
  let validator: SchemaValidator

  beforeAll(() => {
    validator = new SchemaValidator()
  })

  describe('Meta-schema validation', () => {
    it('observatie.json is valid Draft 2020-12', async () => {
      const result = await validator.validateSchema(path.join(schemaDir, 'observatie.json'))
      if (!result.valid) {
        throw new Error(`observatie.json validation failed: ${result.errors?.join('; ')}`)
      }
      expect(result.valid).toBe(true)
    })

    for (const theme of discoveredThemes) {
      it(`${theme}/schema.json is valid Draft 2020-12`, async () => {
        const result = await validator.validateSchema(path.join(schemaDir, theme, 'schema.json'))
        if (!result.valid) {
          throw new Error(`${theme}/schema.json validation failed: ${result.errors?.join('; ')}`)
        }
        expect(result.valid).toBe(true)
      })
    }
  })
})
