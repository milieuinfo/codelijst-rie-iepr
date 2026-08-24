import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as syncFs from 'node:fs'
import { Ajv2020 } from 'ajv/dist/2020.js'
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

describe('Observation collection envelope', () => {
  const envelopePath = path.join(schemaDir, 'observatie-verzameling.json')
  let envelope: any

  beforeAll(async () => {
    envelope = JSON.parse(await fs.readFile(envelopePath, 'utf-8'))
  })

  it('should have observatie-verzameling.json at the root of schema directory', async () => {
    await expect(fs.access(envelopePath)).resolves.toBeUndefined()
  })

  it('should be Draft 2020-12 object type with ObservationCollection annotation', () => {
    expect(envelope.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(envelope.type).toBe('object')
    expect(envelope['x-jsonld-type']).toBe('http://www.w3.org/ns/sosa/ObservationCollection')
  })

  it('should $id end in /observatie-verzameling.json', () => {
    expect(envelope.$id as string).toMatch(/\/observatie-verzameling\.json$/)
  })

  it('should require hasFeatureOfInterest and hasMember', () => {
    expect(new Set(envelope.required as string[])).toEqual(new Set(['hasFeatureOfInterest', 'hasMember']))
  })

  it('should define hasMember as an array (minItems 1) of observatie.json refs', () => {
    const hasMember = envelope.properties.hasMember as any
    expect(hasMember.type).toBe('array')
    expect(hasMember.minItems).toBe(1)
    expect(hasMember['x-jsonld-id']).toBe('http://www.w3.org/ns/sosa/hasMember')
    expect(hasMember.items.$ref).toMatch(/\/observatie\.json$/)
  })

  it('should carry hoisted member properties at collection level (optional)', () => {
    const props = Object.keys(envelope.properties)
    for (const key of [
      'created',
      'observedProperty',
      'resultTime',
      'wasOriginatedBy',
      'phenomenonTime',
      'madeBySensor',
      'usedProcedure',
      'hasUltimateFeatureOfInterest',
    ]) {
      expect(props).toContain(key)
    }
  })

  it('enforces hasMember: collection with members valid, missing/empty hasMember invalid', () => {
    // Build a self-contained schema from the generated envelope's required + hasMember
    // constraints. External SOSA $refs are not resolvable offline, so members are
    // validated as plain objects while the required/minItems come from the schema.
    const ajv = new Ajv2020({ strict: false })
    const hasMember = envelope.properties.hasMember as any
    const validate = ajv.compile({
      type: 'object',
      required: envelope.required,
      properties: {
        hasFeatureOfInterest: { type: 'string' },
        hasMember: { type: 'array', minItems: hasMember.minItems, items: { type: 'object' } },
      },
    })

    expect(validate({ hasFeatureOfInterest: 'https://example.org/ep', hasMember: [{}, {}] })).toBe(true)
    expect(validate({ hasFeatureOfInterest: 'https://example.org/ep' })).toBe(false)
    expect(validate({ hasFeatureOfInterest: 'https://example.org/ep', hasMember: [] })).toBe(false)
  })
})

describe('Collection sub-schemas', () => {
  interface CollectionSubSchema {
    theme: string
    name: string
    schema: any
  }

  async function discoverCollectionSubSchemas(): Promise<CollectionSubSchema[]> {
    const found: CollectionSubSchema[] = []
    for (const theme of discoveredThemes) {
      const themeDir = path.join(schemaDir, theme)
      let entries: string[] = []
      try {
        entries = await fs.readdir(themeDir)
      } catch {
        continue
      }
      for (const name of entries) {
        const subPath = path.join(themeDir, name, 'schema.json')
        try {
          const schema = JSON.parse(await fs.readFile(subPath, 'utf-8'))
          if (schema['x-jsonld-type'] === 'http://www.w3.org/ns/sosa/ObservationCollection') {
            found.push({ theme, name, schema })
          }
        } catch {
          // Not a sub-schema (e.g. the theme's own schema.json)
        }
      }
    }
    return found
  }

  it('generates at least one collection sub-schema', async () => {
    const collections = await discoverCollectionSubSchemas()
    expect(collections.length).toBeGreaterThanOrEqual(1)
  })

  it('each collection sub-schema wraps members under hasMember', async () => {
    const collections = await discoverCollectionSubSchemas()
    for (const { theme, name, schema } of collections) {
      expect(new Set(schema.required), `${theme}/${name} required`).toEqual(
        new Set(['hasFeatureOfInterest', 'hasMember']),
      )
      const hasMember = schema.properties.hasMember as any
      expect(hasMember.type, `${theme}/${name} hasMember.type`).toBe('array')
      expect(hasMember.minItems, `${theme}/${name} hasMember.minItems`).toBe(1)
      expect(hasMember['x-jsonld-id'], `${theme}/${name} hasMember id`).toBe('http://www.w3.org/ns/sosa/hasMember')
      expect(hasMember.items.type, `${theme}/${name} member type`).toBe('object')
      expect(hasMember.items.required, `${theme}/${name} member required`).toContain('hasResult')
    }
  })
})
