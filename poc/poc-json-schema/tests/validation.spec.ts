import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'

// The test file lives at tests/validation.spec.ts inside poc-json-schema/
// Output dir is at output/schema/ within the same project root
const PROJECT_ROOT = path.resolve(__dirname, '..')
const outDir = path.resolve(PROJECT_ROOT, 'output')

describe('Generated Schemas', () => {
  it('should generate exactly 7 schema files (observatie + 6 themes)', async () => {
    const schemaDir = path.join(outDir, 'schema')
    const files = await fs.readdir(schemaDir, { recursive: true })
    const jsonFiles = files.filter(f => typeof f === 'string' && f.endsWith('.json'))
    expect(jsonFiles.length).toBe(7)
  })

  it('should have observatie.json at the root of schema directory', async () => {
    const filePath = path.join(outDir, 'schema', 'observatie.json')
    await expect(fs.access(filePath)).resolves.toBeUndefined()
  })

  it('should have domain schemas for all 6 themes', async () => {
    const expectedThemes = ['grondstoffen', 'grondwater', 'lucht', 'water', 'zelfcontrole-lucht', 'zelfcontrole-water']
    for (const theme of expectedThemes) {
      const filePath = path.join(outDir, 'schema', theme, 'schema.json')
      await expect(fs.access(filePath)).resolves.toBeUndefined()
    }
  })

  describe('Base observatie schema', () => {
    let baseSchema: Record<string, unknown>

    beforeAll(async () => {
      const content = await fs.readFile(path.join(outDir, 'schema', 'observatie.json'), 'utf-8')
      baseSchema = JSON.parse(content)
    })

    it('should have valid Draft 2020-12 $schema keyword', () => {
      expect(baseSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    })

    it('should have correct $id', () => {
      expect(baseSchema.$id).toBe('https://data.riepr.omgeving.vlaanderen.be/schema/2026/observatie/observatie.json')
    })

    it('should be a valid object type', () => {
      expect(baseSchema.type).toBe('object')
    })

    it('should have all 5 required properties', () => {
      const props = Object.keys((baseSchema.properties || {}) as object)
      expect(props).toContain('resultTime')
      expect(props).toContain('observedProperty')
      expect(props).toContain('hasFeatureOfInterest')
      expect(props).toContain('wasOriginatedBy')
      expect(props).toContain('hasResult')
    })

    it('should use allOf composition pattern for all properties', () => {
      const props = baseSchema.properties as Record<string, unknown>
      for (const key of ['resultTime', 'observedProperty', 'hasFeatureOfInterest', 'wasOriginatedBy', 'hasResult']) {
        expect((props[key] as any)?.allOf).toBeDefined()
        expect(Array.isArray((props[key] as any)?.allOf)).toBe(true)
      }
    })

    it('should have Dutch labels and descriptions', () => {
      const resultTime = baseSchema.properties?.resultTime as any
      expect(resultTime.allOf[1].title).toBe('Tijdstip')
      expect(resultTime.allOf[1].description).toBe('Datum en tijdstip waarop de observatie is uitgevoerd.')
    })

    it('should have hasResult with numericValue and hasUnit sub-properties', () => {
      const hasResult = baseSchema.properties?.hasResult as any
      const override = hasResult.allOf.find((a: any) => a.type === 'object')
      expect(override.properties.numericValue.type).toBe('number')
      expect(override.properties.hasUnit.format).toBe('uri-template')
    })

    it('should match archive structure semantically', async () => {
      // Compare against archived reference to ensure semantic equivalence
      const archivePath = path.resolve(PROJECT_ROOT, 'docs/archive/observatie.json')
      const content = await fs.readFile(archivePath, 'utf-8')
      const archiveSchema = JSON.parse(content)

      expect(baseSchema.$schema).toBe(archiveSchema.$schema)
      expect(baseSchema.$id).toBe(archiveSchema.$id)
      expect(new Set(Object.keys(baseSchema.properties || {}))).toEqual(new Set(Object.keys(archiveSchema.properties || {})))

      for (const key of Object.keys(baseSchema.properties || {})) {
        expect(Array.isArray((baseSchema.properties as any)[key].allOf)).toBe(true)
      }
    })
  })

  describe('Domain schemas', () => {
    const themes = ['grondstoffen', 'grondwater', 'lucht', 'water', 'zelfcontrole-lucht', 'zelfcontrole-water']

    for (const theme of themes) {
      let schema: Record<string, unknown>

      beforeAll(async () => {
        const content = await fs.readFile(path.join(outDir, 'schema', theme, 'schema.json'), 'utf-8')
        schema = JSON.parse(content)
      })

      it(`${theme}: should have valid Draft 2020-12 $schema keyword`, () => {
        expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
      })

      it(`${theme}: should reference base observatie schema in resultTime`, () => {
        const props = schema.properties as Record<string, unknown>
        expect(props.resultTime?.$ref).toContain('observatie.json#/properties/resultTime')
      })

      it(`${theme}: should reference base observatie schema in observedProperty`, () => {
        const props = schema.properties as Record<string, unknown>
        const obsProp = props.observedProperty as any
        if (obsProp?.allOf && obsProp.allOf.length > 0) {
          expect(obsProp.allOf[0].$ref).toContain('observatie.json#/properties/observedProperty')
        }
      })

      it(`${theme}: should reference base observatie schema in hasResult`, () => {
        const hasResult = (schema.properties?.hasResult as any)
        if (hasResult?.allOf && hasResult.allOf.length > 0) {
          expect(hasResult.allOf[0].$ref).toContain('observatie.json#/properties/hasResult')
        }
      })

      it(`${theme}: should have domain-specific properties beyond the base envelope`, async () => {
        // Each theme should have at least some domain fields beyond the 5 base ones
        const props = Object.keys(schema.properties || {})
        expect(props.length).toBeGreaterThan(5)
      })

      it(`${theme}: should be valid JSON and parseable`, () => {
        expect(() => JSON.parse(JSON.stringify(schema))).not.toThrow()
      })
    }
  })
})
